import { useCallback, useEffect, useRef } from 'react'

import type { Dispatch, RefObject, SetStateAction } from 'react'

import { HELP_CHAPTERS } from './help-content'

interface HelpModalScrollSpyOptions {
  visible: boolean
  enabled: boolean
  loading: boolean
  content: string
  viewportRef: RefObject<HTMLDivElement | null>
  setActiveChapter: Dispatch<SetStateAction<string>>
}

export function useHelpModalScrollSpy({
  visible,
  enabled,
  loading,
  content,
  viewportRef,
  setActiveChapter,
}: HelpModalScrollSpyOptions): (chapterId: string) => void {
  const programmaticTargetRef = useRef<string | null>(null)
  const releaseTimerRef = useRef<number | null>(null)

  const handleChapterClick = useCallback((chapterId: string) => {
    programmaticTargetRef.current = chapterId
    if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current)
    releaseTimerRef.current = window.setTimeout(() => {
      programmaticTargetRef.current = null
      releaseTimerRef.current = null
    }, 1200)
    setActiveChapter(chapterId)
    const viewport = viewportRef.current
    const target = viewport?.querySelector<HTMLElement>(`#${chapterId}`)
    if (!viewport || !target) return

    const targetTop = target.getBoundingClientRect().top
      - viewport.getBoundingClientRect().top
      + viewport.scrollTop
    viewport.scrollTo({ top: targetTop, behavior: 'smooth' })
  }, [setActiveChapter, viewportRef])

  useEffect(() => {
    if (!visible || !enabled || loading) return
    const viewport = viewportRef.current
    if (!viewport) return

    const chapters = HELP_CHAPTERS
      .map((chapter) => viewport.querySelector<HTMLElement>(`#${chapter.id}`))
      .filter((chapter): chapter is HTMLElement => chapter !== null)
    if (chapters.length === 0) return

    let animationFrame = 0
    const updateActiveChapter = () => {
      animationFrame = 0
      const programmaticTarget = programmaticTargetRef.current
      if (programmaticTarget) {
        setActiveChapter(programmaticTarget)
        return
      }
      const threshold = viewport.getBoundingClientRect().top + 24
      const atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2
      let nextChapter = chapters[0]

      if (atBottom) nextChapter = chapters[chapters.length - 1]
      else {
        for (const chapter of chapters) {
          if (chapter.getBoundingClientRect().top <= threshold) nextChapter = chapter
          else break
        }
      }

      setActiveChapter((current) => current === nextChapter.id ? current : nextChapter.id)
    }
    const handleScroll = () => {
      if (animationFrame !== 0) return
      animationFrame = window.requestAnimationFrame(updateActiveChapter)
    }

    animationFrame = window.requestAnimationFrame(updateActiveChapter)
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      viewport.removeEventListener('scroll', handleScroll)
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame)
    }
  }, [content, enabled, loading, setActiveChapter, viewportRef, visible])

  useEffect(() => () => {
    if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current)
  }, [])

  return handleChapterClick
}
