(() => {
  const candidates = Array.from(document.querySelectorAll('[data-candidate]'));
  const status = document.querySelector('[data-selection-status]');

  function selectCandidate(candidate) {
    candidates.forEach((item) => {
      const selected = item === candidate;
      item.classList.toggle('is-selected', selected);
      const button = item.querySelector('[data-select-candidate]');
      button.setAttribute('aria-pressed', String(selected));
      button.textContent = selected ? '已选择' : '选择此版';
    });
    if (status) status.textContent = `当前选择 · ${candidate.dataset.candidate}`;
  }

  candidates.forEach((candidate) => {
    candidate.querySelector('[data-select-candidate]').addEventListener('click', () => selectCandidate(candidate));
  });

  const initialCode = document.querySelector('[data-initial-candidate]')?.dataset.initialCandidate;
  const initialCandidate = initialCode && candidates.find((candidate) => candidate.dataset.candidate === initialCode);
  if (initialCandidate) selectCandidate(initialCandidate);
})();
