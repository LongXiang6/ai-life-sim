#!/usr/bin/env bash
# Purpose: Execute the remote half of one locked production deployment transaction.
# Owner: project-skill:ai-life-sim
# Responsibility: Remote validation, release switch, health verification, and rollback state only.

set -Eeuo pipefail

test "$#" = 10 || exit 64
release="$1"
archive="$2"
commit="$3"
run_id="$4"
expected_previous="$5"
expected_previous_commit="$6"
archive_sha256="$7"
recovery_script="$8"
recovery_sha256="$9"
persistence_migration="${10}"

active=/root/ai-life-sim
release_root=/root/ai-life-sim-releases
backup_root=/root/ai-life-sim-backups
backup_dir="$backup_root/$commit-$run_id"
state_root=/root/ai-life-sim-deploy-state
state_file="$state_root/$run_id.state"
lock_file=/run/lock/ai-life-sim-deploy.lock
memory_root=/var/lib/ai-life-sim/narrative-memory
round_root=/var/log/ai-life-sim/narrative-rounds
next_link="/root/ai-life-sim-next-$run_id-$$"
rollback_link="/root/ai-life-sim-rollback-$run_id-$$"
unit_names=(
  ai-life-sim-account-cleanup.service
  ai-life-sim-account-cleanup.timer
  ai-life-sim-release-cleanup.service
  ai-life-sim-release-cleanup.timer
  ai-life-sim-operations-dashboard.service
)
enabled_units=(
  ai-life-sim-account-cleanup.timer
  ai-life-sim-release-cleanup.timer
  ai-life-sim-operations-dashboard.service
)

[[ "$release" =~ ^/root/ai-life-sim-releases/[0-9a-f]{40}$ ]] || exit 64
[[ "$archive" =~ ^/tmp/ai-life-sim-[0-9a-f]{40}-[0-9a-f]{32}\.tar\.gz$ ]] || exit 64
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || exit 64
[[ "$run_id" =~ ^[0-9a-f]{32}$ ]] || exit 64
[[ "$expected_previous" =~ ^/root/ai-life-sim-releases/([0-9a-f]{7}|[0-9a-f]{40})$ ]] || exit 64
[[ "$expected_previous_commit" =~ ^[0-9a-f]{40}$ ]] || exit 64
[[ "$archive_sha256" =~ ^[0-9a-f]{64}$ ]] || exit 64
[[ "$recovery_sha256" =~ ^[0-9a-f]{64}$ ]] || exit 64
case "$persistence_migration" in
  none|player-mailbox-v5|game-record-lifespan-adjustments|log-archive-v1) ;;
  *) exit 64 ;;
esac
test "$release" = "$release_root/$commit"
test "$backup_dir" = "$backup_root/$commit-$run_id"
test "$state_file" = "$state_root/$run_id.state"
test "$recovery_script" = "$state_root/$run_id.recover.sh"

cleanup_inputs() {
  rm -f -- "$archive" "$next_link" "$rollback_link"
  if [ ! -e "$state_file" ]; then rm -f -- "$recovery_script"; fi
  if [[ "$0" =~ ^/tmp/ai-life-sim-deploy-[0-9a-f]{32}\.sh$ ]]; then
    rm -f -- "$0"
  fi
}
trap cleanup_inputs EXIT
test -f "$archive"
test -f "$recovery_script"

for required_command in flock ss curl tar node npm pm2 systemctl grep sed stat readlink install sha256sum find; do
  command -v "$required_command" >/dev/null 2>&1 || {
    echo "DEPLOY_PREREQUISITE_MISSING $required_command" >&2
    exit 69
  }
done

exec 9>"$lock_file"
if flock -w 900 9; then
  :
else
  lock_status=$?
  if [ "$lock_status" -eq 1 ]; then echo 'DEPLOY_LOCK_TIMEOUT' >&2; fi
  exit "$lock_status"
fi

install -d -m 0700 "$state_root"
test ! -e "$state_file" || {
  echo "RUN_ID_EXISTS state=$state_file" >&2
  exit 74
}

blocked_by=''
blocked_status=''
interrupted_status=''

write_state() {
  local state="$1"
  local temp_state="$state_file.tmp.$$"
  umask 077
  {
    printf 'state_schema=2\n'
    printf 'status=%s\n' "$state"
    printf 'commit=%s\n' "$commit"
    printf 'expected_previous=%s\n' "$expected_previous"
    printf 'expected_previous_commit=%s\n' "$expected_previous_commit"
    printf 'release=%s\n' "$release"
    printf 'backup=%s\n' "$backup_dir"
    printf 'archive_sha256=%s\n' "$archive_sha256"
    printf 'recovery_script=%s\n' "$recovery_script"
    printf 'recovery_sha256=%s\n' "$recovery_sha256"
    printf 'persistence_migration=%s\n' "$persistence_migration"
    if [[ "$state" = RUNNING_* ]]; then interrupted_status="$state"; fi
    if [ -n "$interrupted_status" ]; then
      printf 'interrupted_status=%s\n' "$interrupted_status"
    fi
    if [ -n "$blocked_by" ]; then
      printf 'blocked_by=%s\n' "$blocked_by"
      printf 'blocked_status=%s\n' "$blocked_status"
    fi
  } > "$temp_state"
  chmod 0600 "$temp_state"
  mv -f "$temp_state" "$state_file"
}

env_has_unique_value() {
  local file="$1"
  local key="$2"
  local expected="$3"
  local key_count expected_count
  key_count="$(grep -Ec "^${key}=" "$file" || true)"
  expected_count="$(grep -Fxc "$key=$expected" "$file" || true)"
  [ "$key_count" = 1 ] && [ "$expected_count" = 1 ]
}

resolve_log_database_path() {
  local file="$1"
  local value=''
  local -a database_lines directory_lines
  mapfile -t database_lines < <(sed -n 's/^AI_LOG_DB_PATH=//p' "$file")
  mapfile -t directory_lines < <(sed -n 's/^AI_LOG_DIR=//p' "$file")
  [ "${#database_lines[@]}" -le 1 ] || return 1
  [ "${#directory_lines[@]}" -le 1 ] || return 1
  if [ "${#database_lines[@]}" -eq 1 ] && [ -n "${database_lines[0]}" ]; then
    value="${database_lines[0]}"
  elif [ "${#directory_lines[@]}" -eq 1 ] && [ -n "${directory_lines[0]}" ]; then
    value="${directory_lines[0]%/}/logs.sqlite"
  else
    value='/var/lib/ai-life-sim/logs.sqlite'
  fi
  [[ "$value" =~ ^/[A-Za-z0-9._/-]+$ ]] || return 1
  printf '%s\n' "$value"
}

legacy_persistence_is_empty() {
  local legacy_path entry
  for legacy_path in \
    "$previous/.data/narrative-memory" \
    "$previous/.data/narrative-rounds"; do
    if [ -e "$legacy_path" ]; then
      [ ! -L "$legacy_path" ] || return 1
      [ -d "$legacy_path" ] || return 1
      entry="$(find "$legacy_path" -mindepth 1 -print -quit)" || return 1
      [ -z "$entry" ] || return 1
    fi
  done
}

find_unresolved_state() {
  local candidate status
  local -a status_lines
  shopt -s nullglob
  for candidate in "$state_root"/*.state; do
    if [[ ! "$candidate" =~ /[0-9a-f]{32}\.state$ ]]; then
      printf '%s|CORRUPT\n' "$candidate"
      return 0
    fi
    mapfile -t status_lines < <(sed -n 's/^status=//p' "$candidate")
    if [ "${#status_lines[@]}" -ne 1 ]; then
      printf '%s|CORRUPT\n' "$candidate"
      return 0
    fi
    status="${status_lines[0]}"
    case "$status" in
      RUNNING_*|ROLLBACK_FAILED|RECOVERY_ROLLBACK_FAILED)
        printf '%s|%s\n' "$candidate" "$status"
        return 0
        ;;
      ACTIVE_CHANGED|ACTIVE_PERSISTENCE_PATHS_INVALID|ACTIVE_RELEASE_INVALID|ACTIVE_UNHEALTHY|BLOCKED_UNRESOLVED|DEPLOY_INPUT_INVALID|DEPLOY_OK|NOOP|PREACTIVATION_CLEANUP_OK|PREACTIVATION_FAILED_UNCHANGED|RECOVERY_ROLLBACK_OK|RELEASE_EXISTS|ROLLBACK_OK)
        ;;
      *)
        printf '%s|CORRUPT\n' "$candidate"
        return 0
        ;;
    esac
  done
  return 1
}

if unresolved="$(find_unresolved_state)"; then
  blocked_by="${unresolved%%|*}"
  blocked_status="${unresolved#*|}"
  write_state BLOCKED_UNRESOLVED
  echo "BLOCKED_UNRESOLVED state=$blocked_by status=$blocked_status" >&2
  exit 75
fi

if [ "$(stat -c %u:%a "$archive")" != '0:600' ] ||
   [ "$(stat -c %u:%a "$recovery_script")" != '0:700' ] ||
   ! echo "$archive_sha256  $archive" | sha256sum -c - >/dev/null 2>&1 ||
   ! echo "$recovery_sha256  $recovery_script" | sha256sum -c - >/dev/null 2>&1; then
  write_state DEPLOY_INPUT_INVALID
  echo 'DEPLOY_INPUT_INVALID root-owned archive or recovery snapshot verification failed' >&2
  exit 72
fi

created=0
switched=0
quiesced=0
timer_suspended=0
backup_dir_created=0
backup_ready=0
previous=''
log_database=''

run_mailbox_migration() {
  local mode="$1"
  shift
  (
    cd "$release"
    node --no-warnings=ExperimentalWarning \
      --loader ./scripts/check/lib/typescript-loader.mjs \
      scripts/ops/migrate-player-mailbox-v5.ts "$mode" \
      --player-content-database /var/lib/ai-life-sim/player-content.sqlite \
      --account-database /var/lib/ai-life-sim/accounts.sqlite \
      "$@"
  )
}

run_game_record_migration() {
  local mode="$1"
  shift
  (
    cd "$release"
    node --no-warnings=ExperimentalWarning \
      --loader ./scripts/check/lib/typescript-loader.mjs \
      scripts/ops/migrate-game-record-lifespan-adjustments.ts "$mode" \
      --player-content-database /var/lib/ai-life-sim/player-content.sqlite \
      --account-database /var/lib/ai-life-sim/accounts.sqlite \
      "$@"
  )
}

run_log_archive_migration() {
  local mode="$1"
  shift
  (
    cd "$release"
    node --no-warnings=ExperimentalWarning \
      --loader ./scripts/check/lib/typescript-loader.mjs \
      scripts/ops/migrate-log-archive-v1.ts "$mode" \
      --log-database "$log_database" \
      "$@"
  )
}

rollback_persistence_migration() {
  case "$persistence_migration" in
    none) return 0 ;;
    player-mailbox-v5)
      run_mailbox_migration rollback --backup-directory "$backup_dir"
      ;;
    game-record-lifespan-adjustments)
      run_game_record_migration rollback --backup-directory "$backup_dir"
      ;;
    log-archive-v1)
      run_log_archive_migration rollback --backup-directory "$backup_dir"
      ;;
  esac
}

quiesce_switched_runtime() {
  local quiesce_status=0 cleanup_idle=0 write_stopped=0 cleanup_state
  local pm2_pid_output pm2_pid_code listener_output listener_code pid positive_pid
  systemctl stop ai-life-sim-account-cleanup.timer || quiesce_status=1
  for _ in $(seq 1 60); do
    cleanup_state="$(systemctl show ai-life-sim-account-cleanup.service --property=ActiveState --value)" || {
      quiesce_status=1
      break
    }
    case "$cleanup_state" in
      inactive|failed) cleanup_idle=1; break ;;
    esac
    sleep 2
  done
  if [ "$cleanup_idle" != 1 ]; then quiesce_status=1; fi
  pm2 stop ai-life-sim || quiesce_status=1
  for _ in $(seq 1 30); do
    pm2_pid_output="$(pm2 pid ai-life-sim 2>&1)"
    pm2_pid_code=$?
    listener_output="$(ss -H -ltn 'sport = :3000' 2>&1)"
    listener_code=$?
    if [ "$pm2_pid_code" -ne 0 ] || [ "$listener_code" -ne 0 ]; then
      quiesce_status=1
      break
    fi
    positive_pid=0
    for pid in $pm2_pid_output; do
      if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
        quiesce_status=1
        positive_pid=1
        break
      fi
      if [[ "$pid" =~ ^[1-9][0-9]*$ ]]; then positive_pid=1; fi
    done
    if [ "$positive_pid" = 0 ] && [ -z "$listener_output" ]; then
      write_stopped=1
      break
    fi
    sleep 1
  done
  if [ "$write_stopped" != 1 ]; then quiesce_status=1; fi
  return "$quiesce_status"
}

runtime_check_failed() {
  local check="$1"
  shift
  printf 'RUNTIME_CHECK_FAILED check=%s' "$check" >&2
  while [ "$#" -gt 0 ]; do
    printf ' %s' "$1" >&2
    shift
  done
  printf '\n' >&2
}

wait_http() {
  local check="$1"
  local url="$2"
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  runtime_check_failed "$check" "url=$url"
  return 1
}

verify_runtime() {
  local expected="$1"
  local pids found_pid pid build_id name
  test -d "$expected" || { runtime_check_failed release-directory "path=$expected"; return 1; }
  test -f "$expected/.next/BUILD_ID" || { runtime_check_failed build-id-file "path=$expected/.next/BUILD_ID"; return 1; }
  test "$(readlink -f "$active")" = "$expected" || { runtime_check_failed active-link "expected=$expected"; return 1; }
  pids="$(pm2 pid ai-life-sim 2>/dev/null)" || { runtime_check_failed pm2-pid-query; return 1; }
  found_pid=0
  for pid in $pids; do
    [[ "$pid" =~ ^[1-9][0-9]*$ ]] || { runtime_check_failed pm2-pid-format "value=$pid"; return 1; }
    test "$(readlink -f "/proc/$pid/cwd")" = "$expected" || { runtime_check_failed pm2-working-directory "pid=$pid" "expected=$expected"; return 1; }
    found_pid=1
  done
  test "$found_pid" = 1 || { runtime_check_failed pm2-running-process; return 1; }
  for name in "${enabled_units[@]}"; do
    systemctl is-enabled --quiet "$name" || { runtime_check_failed systemd-enabled "unit=$name"; return 1; }
    systemctl is-active --quiet "$name" || { runtime_check_failed systemd-active "unit=$name"; return 1; }
  done
  build_id="$(cat "$expected/.next/BUILD_ID")" || { runtime_check_failed build-id-read; return 1; }
  [[ "$build_id" =~ ^[A-Za-z0-9_-]+$ ]] || { runtime_check_failed build-id-format; return 1; }
  wait_http loopback-home http://127.0.0.1:3000/ || return 1
  wait_http build-manifest "http://127.0.0.1:3000/_next/static/$build_id/_buildManifest.js" || return 1
  wait_http operations-dashboard http://127.0.0.1:4317/api/stats || return 1
}

restore_old_runtime() {
  local restore_status=0
  local previous_units="$previous/scripts/ops/systemd"
  local name
  for name in "${unit_names[@]}"; do
    install -m 0644 "$previous_units/$name" "/etc/systemd/system/$name" || restore_status=1
  done
  systemctl daemon-reload || restore_status=1
  for name in "${enabled_units[@]}"; do systemctl enable "$name" || restore_status=1; done
  pm2 restart ai-life-sim --update-env || restore_status=1
  pm2 save || restore_status=1
  for name in "${enabled_units[@]}"; do systemctl restart "$name" || restore_status=1; done
  verify_runtime "$previous" || restore_status=1
  return "$restore_status"
}

restore_failure() {
  local original_status="$1"
  local rollback_status=0
  local had_switch="$switched"
  local had_quiesce="$quiesced"
  local current
  trap - ERR HUP INT TERM
  set +e

  if [ "$had_switch" = 1 ]; then
    quiesce_switched_runtime || rollback_status=1
  fi
  rm -f -- "$next_link" "$rollback_link"
  if [ "$switched" = 1 ]; then
    ln -s "$previous" "$rollback_link" || rollback_status=1
    mv -Tf "$rollback_link" "$active" || rollback_status=1
  fi

  if [ "$rollback_status" -eq 0 ] && [ "$backup_ready" = 1 ]; then
    rollback_persistence_migration || rollback_status=1
  fi

  current="$(readlink -f "$active" 2>/dev/null || true)"
  if [ "$had_switch" = 1 ] || [ "$had_quiesce" = 1 ]; then
    if [ "$rollback_status" -eq 0 ] && [ "$current" = "$previous" ]; then
      restore_old_runtime || rollback_status=1
    else
      rollback_status=1
    fi
  elif [ "$timer_suspended" = 1 ]; then
    systemctl restart ai-life-sim-account-cleanup.timer || rollback_status=1
    systemctl is-active --quiet ai-life-sim-account-cleanup.timer || rollback_status=1
  fi

  if [ "$rollback_status" -eq 0 ] && [ "$created" = 1 ]; then
    current="$(readlink -f "$active" 2>/dev/null || true)"
    if [ "$current" = "$previous" ]; then
      rm -rf --one-file-system -- "$release" || rollback_status=1
    else
      rollback_status=1
    fi
  fi
  if [ "$rollback_status" -eq 0 ] && [ "$backup_dir_created" = 1 ] && [ "$backup_ready" = 0 ]; then
    rm -rf --one-file-system -- "$backup_dir" || rollback_status=1
  fi

  if [ "$rollback_status" -ne 0 ]; then
    write_state ROLLBACK_FAILED || true
    echo "ROLLBACK_FAILED previous=$previous release=$release backup=$backup_dir" >&2
    exit 86
  fi
  if [ "$had_switch" = 1 ] || [ "$had_quiesce" = 1 ]; then
    write_state ROLLBACK_OK || { echo 'failed to persist rollback state' >&2; exit 86; }
    echo "ROLLBACK_OK previous=$previous discarded=$release backup_ready=$backup_ready backup=$backup_dir" >&2
  elif [ "$created" = 1 ]; then
    write_state PREACTIVATION_CLEANUP_OK || { echo 'failed to persist cleanup state' >&2; exit 86; }
    echo "PREACTIVATION_CLEANUP_OK previous=$previous discarded=$release backup_ready=$backup_ready backup=$backup_dir" >&2
  else
    write_state PREACTIVATION_FAILED_UNCHANGED || { echo 'failed to persist unchanged state' >&2; exit 86; }
    echo "PREACTIVATION_FAILED_UNCHANGED previous=$previous release=$release" >&2
  fi
  exit "$original_status"
}

on_error() { local status=$?; restore_failure "$status"; }
trap on_error ERR
trap 'restore_failure 129' HUP
trap 'restore_failure 130' INT
trap 'restore_failure 143' TERM

previous="$(readlink -f "$active" 2>/dev/null || true)"
if [[ ! "$previous" =~ ^/root/ai-life-sim-releases/([0-9a-f]{7}|[0-9a-f]{40})$ ]] ||
   [ ! -d "$previous" ] ||
   [ ! -f "$previous/.env.production.local" ]; then
  write_state ACTIVE_RELEASE_INVALID
  trap - ERR HUP INT TERM
  echo "ACTIVE_RELEASE_INVALID release=$previous" >&2
  exit 77
fi
if [ "$previous" != "$expected_previous" ]; then
  write_state ACTIVE_CHANGED
  trap - ERR HUP INT TERM
  echo "ACTIVE_CHANGED expected=$expected_previous actual=$previous" >&2
  exit 76
fi
previous_units="$previous/scripts/ops/systemd"
for name in "${unit_names[@]}"; do
  if [ ! -f "$previous_units/$name" ]; then
    write_state ACTIVE_RELEASE_INVALID
    trap - ERR HUP INT TERM
    echo "ACTIVE_RELEASE_INVALID missing_unit=$name release=$previous" >&2
    exit 77
  fi
done

if ! env_has_unique_value "$previous/.env.production.local" NARRATIVE_MEMORY_DIR "$memory_root" ||
   ! env_has_unique_value "$previous/.env.production.local" NARRATIVE_ROUND_LOG_DIR "$round_root" ||
   [ ! -d "$memory_root" ] ||
   [ ! -d "$round_root" ] ||
   [ "$(stat -c %u "$memory_root")" != 0 ] ||
   [ "$(stat -c %u "$round_root")" != 0 ] ||
   [ "$(stat -c %a "$memory_root")" != 700 ] ||
   [ "$(stat -c %a "$round_root")" != 700 ] ||
   ! legacy_persistence_is_empty; then
  write_state ACTIVE_PERSISTENCE_PATHS_INVALID
  trap - ERR HUP INT TERM
  echo 'ACTIVE_PERSISTENCE_PATHS_INVALID required=NARRATIVE_MEMORY_DIR,NARRATIVE_ROUND_LOG_DIR' >&2
  exit 79
fi

if [ "$persistence_migration" = log-archive-v1 ]; then
  if ! log_database="$(resolve_log_database_path "$previous/.env.production.local")" ||
     [ ! -d "${log_database%/*}" ] ||
     [ "$(stat -c %u:%a "${log_database%/*}")" != '0:700' ] ||
     [ ! -f "$log_database" ] ||
     [ -L "$log_database" ] ||
     [ "$(stat -c %u:%a "$log_database")" != '0:600' ]; then
    write_state ACTIVE_PERSISTENCE_PATHS_INVALID
    trap - ERR HUP INT TERM
    echo 'ACTIVE_PERSISTENCE_PATHS_INVALID required=log-archive-v1-active-database' >&2
    exit 79
  fi
  log_archive_database="${log_database%/*}/logs-archive.sqlite"
  if [ -e "$log_archive_database" ] &&
     { [ ! -f "$log_archive_database" ] || [ -L "$log_archive_database" ] ||
       [ "$(stat -c %u:%a "$log_archive_database")" != '0:600' ]; }; then
    write_state ACTIVE_PERSISTENCE_PATHS_INVALID
    trap - ERR HUP INT TERM
    echo 'ACTIVE_PERSISTENCE_PATHS_INVALID required=log-archive-v1-archive-database' >&2
    exit 79
  fi
fi

write_state RUNNING_PREFLIGHT
previous_id="${previous##*/}"
release_identity_valid=0
if [ "${#previous_id}" -eq 40 ]; then
  if [ -f "$previous/.release-commit" ] &&
     [ "$(cat "$previous/.release-commit")" = "$expected_previous_commit" ] &&
     [ "$previous_id" = "$expected_previous_commit" ]; then
    release_identity_valid=1
  fi
elif [ "$previous_id" = "${expected_previous_commit:0:7}" ]; then
  release_identity_valid=1
fi
if [ "$release_identity_valid" != 1 ]; then
  write_state ACTIVE_RELEASE_INVALID
  trap - ERR HUP INT TERM
  echo "ACTIVE_RELEASE_INVALID release=$previous expected_commit=$expected_previous_commit" >&2
  exit 77
fi
if ! verify_runtime "$previous"; then
  write_state ACTIVE_UNHEALTHY
  trap - ERR HUP INT TERM
  echo "ACTIVE_UNHEALTHY release=$previous" >&2
  exit 78
fi
if [ "$expected_previous_commit" = "$commit" ]; then
  write_state NOOP
  trap - ERR HUP INT TERM
  echo "NOOP commit=$commit release=$previous health=verified"
  exit 0
fi
if [ -e "$release" ]; then
  write_state RELEASE_EXISTS
  trap - ERR HUP INT TERM
  echo "RELEASE_EXISTS release=$release" >&2
  exit 73
fi

install -d -m 0755 "$release_root"
mkdir -m 0755 "$release"
created=1
write_state RUNNING_PREPARE
echo "$archive_sha256  $archive" | sha256sum -c - >/dev/null
tar --no-same-owner -xzf "$archive" -C "$release"
rm -f -- "$archive"

cd "$release"
test "$(node -p 'process.versions.node.split(".")[0]')" = 20
PUPPETEER_SKIP_DOWNLOAD=1 npm ci

new_units="$release/scripts/ops/systemd"
for name in "${unit_names[@]}"; do test -f "$new_units/$name"; done

install -m 0600 "$previous/.env.production.local" "$release/.env.production.local"
node scripts/ops/validate-production-env.mjs .env.production.local
build_data="$release/.build-data-$run_id"
install -d -m 0700 "$build_data/logs" "$build_data/portraits" "$build_data/narrative-memory" "$build_data/narrative-rounds"
ACCOUNT_DB_PATH="$build_data/accounts.sqlite" \
PLAYER_CONTENT_DB_PATH="$build_data/player-content.sqlite" \
AI_LOG_DIR="$build_data/logs" \
AI_LOG_DB_PATH="$build_data/logs.sqlite" \
PORTRAIT_ASSET_ROOT="$build_data/portraits" \
NARRATIVE_MEMORY_DIR="$build_data/narrative-memory" \
NARRATIVE_ROUND_LOG_DIR="$build_data/narrative-rounds" \
npm run build
rm -rf --one-file-system -- "$build_data"
test -f .next/BUILD_ID
printf '%s\n' "$commit" > .release-commit
chmod 0444 .release-commit
write_state RUNNING_BUILT

timer_suspended=1
systemctl stop ai-life-sim-account-cleanup.timer
cleanup_idle=0
for _ in $(seq 1 60); do
  cleanup_state="$(systemctl show ai-life-sim-account-cleanup.service --property=ActiveState --value)"
  case "$cleanup_state" in
    inactive|failed) cleanup_idle=1; break ;;
  esac
  sleep 2
done
test "$cleanup_idle" = 1

quiesced=1
pm2 stop ai-life-sim
write_stopped=0
for _ in $(seq 1 30); do
  set +e
  pm2_pid_output="$(pm2 pid ai-life-sim 2>&1)"
  pm2_pid_code=$?
  set -e
  if [ "$pm2_pid_code" -ne 0 ]; then
    echo "pm2 pid failed after stop: $pm2_pid_output" >&2
    false
  fi
  positive_pid=0
  for pid in $pm2_pid_output; do
    if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
      echo "unexpected pm2 pid output after stop: $pm2_pid_output" >&2
      false
    fi
    if [[ "$pid" =~ ^[1-9][0-9]*$ ]]; then positive_pid=1; fi
  done
  set +e
  listener_output="$(ss -H -ltn 'sport = :3000' 2>&1)"
  listener_code=$?
  set -e
  if [ "$listener_code" -ne 0 ]; then
    echo "ss failed while checking port 3000: $listener_output" >&2
    false
  fi
  if [ "$positive_pid" = 0 ] && [ -z "$listener_output" ]; then
    write_stopped=1
    break
  fi
  sleep 1
done
test "$write_stopped" = 1
write_state RUNNING_QUIESCED

install -d -m 0700 "$backup_root"
test ! -e "$backup_dir"
mkdir -m 0700 "$backup_dir"
backup_dir_created=1
ACTIVE_RELEASE="$previous" BACKUP_DIR="$backup_dir" \
PERSISTENCE_MIGRATION="$persistence_migration" LOG_DATABASE_PATH="$log_database" \
node --input-type=module <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const activeRelease = process.env.ACTIVE_RELEASE
const backupDir = process.env.BACKUP_DIR
const persistenceMigration = process.env.PERSISTENCE_MIGRATION
const logDatabase = process.env.LOG_DATABASE_PATH
if (!activeRelease || !backupDir || !persistenceMigration) throw new Error('backup paths are missing')
const require = createRequire(path.join(activeRelease, 'package.json'))
const Database = require('better-sqlite3')
const sources = [
  ['/var/lib/ai-life-sim/accounts.sqlite', 'accounts.sqlite'],
  ['/var/lib/ai-life-sim/player-content.sqlite', 'player-content.sqlite'],
]
if (persistenceMigration === 'log-archive-v1') {
  if (!logDatabase || !path.isAbsolute(logDatabase)) throw new Error('log database path is missing')
  sources.push([logDatabase, 'logs.sqlite'])
  const archiveDatabase = path.join(path.dirname(logDatabase), 'logs-archive.sqlite')
  if (fs.existsSync(archiveDatabase)) sources.push([archiveDatabase, 'logs-archive.sqlite'])
}
for (const [source, name] of sources) {
  const destination = path.join(backupDir, name)
  const database = new Database(source, { readonly: true, fileMustExist: true })
  try {
    await database.backup(destination)
  } finally {
    database.close()
  }
  fs.chmodSync(destination, 0o600)
  const snapshot = new Database(destination, { readonly: true, fileMustExist: true })
  try {
    const result = snapshot.pragma('quick_check')
    if (result.length !== 1 || result[0].quick_check !== 'ok') {
      throw new Error(`SQLite quick_check failed for ${name}`)
    }
  } finally {
    snapshot.close()
  }
}
NODE
backup_ready=1
write_state RUNNING_BACKED_UP

case "$persistence_migration" in
  player-mailbox-v5)
    write_state RUNNING_MIGRATING
    run_mailbox_migration apply
    run_mailbox_migration verify
    write_state RUNNING_MIGRATED
    ;;
  game-record-lifespan-adjustments)
    write_state RUNNING_MIGRATING
    run_game_record_migration apply
    run_game_record_migration verify
    write_state RUNNING_MIGRATED
    ;;
  log-archive-v1)
    write_state RUNNING_MIGRATING
    run_log_archive_migration apply
    run_log_archive_migration verify
    write_state RUNNING_MIGRATED
    ;;
esac

ln -s "$release" "$next_link"
mv -Tf "$next_link" "$active"
switched=1
write_state RUNNING_SWITCHED
pm2 restart ai-life-sim --update-env
pm2 save
for name in "${unit_names[@]}"; do
  install -m 0644 "$new_units/$name" "/etc/systemd/system/$name"
done
systemctl daemon-reload
for name in "${enabled_units[@]}"; do
  systemctl enable "$name"
  systemctl restart "$name"
done

test "$(cat "$release/.release-commit")" = "$commit"
verify_runtime "$release"
write_state DEPLOY_OK
trap - ERR HUP INT TERM
echo "DEPLOY_OK commit=$commit previous=$previous release=$release backup=$backup_dir"
