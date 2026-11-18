export class Input
{
    constructor(domElement)
    {
        this.domElement = domElement
        this.held = new Set()
        this.justPressed = new Set()
        this.mouseDeltaX = 0
        this.mouseDeltaY = 0
        this.locked = false

        this.onLockChange = null
        this.onLockError = null

        window.addEventListener('keydown', (event) =>
        {
            // The pause screen is up whenever the pointer is free.
            if (!this.locked || event.repeat) return
            this.held.add(event.code)
            this.justPressed.add(event.code)

            // Space would otherwise scroll the page.
            if (event.code === 'Space') event.preventDefault()
        })

        window.addEventListener('keyup', (event) => this.held.delete(event.code))
        window.addEventListener('blur', () => this.held.clear())

        document.addEventListener('pointerlockchange', () =>
        {
            this.locked = document.pointerLockElement === this.domElement
            this.held.clear()
            this.justPressed.clear()
            this.mouseDeltaX = 0
            this.mouseDeltaY = 0
            this.onLockChange?.(this.locked)
        })

        document.addEventListener('mousemove', (event) =>
        {
            if (!this.locked) return
            this.mouseDeltaX += event.movementX
            this.mouseDeltaY += event.movementY
        })
    }

    requestLock()
    {
        // The promise rejects when Firefox cannot grab the pointer (an open
        // menu, the console, or a permission popup). An uncaught rejection
        // is the "failed to lock the pointer" exception.
        try
        {
            const pending = this.domElement.requestPointerLock()
            pending?.catch((error) => this.onLockError?.(error))
        }
        catch (error)
        {
            this.onLockError?.(error)
        }
    }

    isHeld(code)
    {
        return this.held.has(code)
    }

    /** True once per physical key press. */
    wasPressed(code)
    {
        return this.justPressed.has(code)
    }

    /** Signed axis from a pair of keys, e.g. axis('KeyW', 'KeyS'). */
    axis(positive, negative)
    {
        return (this.isHeld(positive) ? 1 : 0) - (this.isHeld(negative) ? 1 : 0)
    }

    endFrame()
    {
        this.justPressed.clear()
        this.mouseDeltaX = 0
        this.mouseDeltaY = 0
    }
}
