import { useEffect, useRef } from 'react'

interface UseIdleTimerProps {
    timeout: number
    promptBeforeIdle?: number
    onIdle: () => void
    onPrompt?: () => void
    onActive?: () => void
    isActive: boolean
}

export function useIdleTimer({
    timeout,
    promptBeforeIdle = 0,
    onIdle,
    onPrompt,
    onActive,
    isActive
}: UseIdleTimerProps) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isPromptActiveRef = useRef(false)

    const onIdleRef = useRef(onIdle)
    const onPromptRef = useRef(onPrompt)
    const onActiveRef = useRef(onActive)

    useEffect(() => {
        onIdleRef.current = onIdle
        onPromptRef.current = onPrompt
        onActiveRef.current = onActive
    }, [onIdle, onPrompt, onActive])

    useEffect(() => {
        if (!isActive) {
            if (timerRef.current) clearTimeout(timerRef.current)
            if (promptTimerRef.current) clearTimeout(promptTimerRef.current)
            return
        }

        const runIdle = () => {
            if (onIdleRef.current) onIdleRef.current()
        }

        const runPrompt = () => {
            isPromptActiveRef.current = true
            if (onPromptRef.current) onPromptRef.current()
        }

        const resetTimer = () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            if (promptTimerRef.current) clearTimeout(promptTimerRef.current)

            isPromptActiveRef.current = false

            // Notify that user is active (hides prompt if visible)
            if (onActiveRef.current) onActiveRef.current()

            // Set the final idle timeout
            timerRef.current = setTimeout(runIdle, timeout)

            // Set the prompt timeout if configured
            if (promptBeforeIdle > 0 && timeout > promptBeforeIdle) {
                promptTimerRef.current = setTimeout(runPrompt, timeout - promptBeforeIdle)
            }
        }

        const events = [
            'mousemove',
            'mousedown',
            'keypress',
            'DOMMouseScroll',
            'mousewheel',
            'touchmove',
            'MSPointerMove',
            'click',
            'scroll',
            'keydown'
        ]

        const handleEvent = (event: Event) => {
            // If prompt is active, ignore passive events like mousemove
            if (isPromptActiveRef.current) {
                const passiveEvents = [
                    'mousemove',
                    'DOMMouseScroll',
                    'mousewheel',
                    'touchmove',
                    'MSPointerMove',
                    'scroll'
                ]
                if (passiveEvents.includes(event.type)) {
                    return
                }
            }
            resetTimer()
        }

        // Add event listeners
        events.forEach(event => {
            window.addEventListener(event, handleEvent)
        })

        // Initial start
        resetTimer()

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            if (promptTimerRef.current) clearTimeout(promptTimerRef.current)
            events.forEach(event => {
                window.removeEventListener(event, handleEvent)
            })
        }
    }, [timeout, promptBeforeIdle, isActive])
}
