const METRES_PER_SECOND_TO_KNOTS = 1.94384

/** How long a finished lap stays on screen. */
const LAP_HOLD = 4

/** m:ss.t, the way the lap clock and the leaderboard show a time. */
export function formatLap(seconds)
{
    // Whole tenths first: 38.9 % 1 is 0.8999..., which would read 38.8. The
    // nudge keeps a time that is exactly on a tenth from dropping to the one below.
    const totalTenths = Math.floor(Math.max(0, seconds) * 10 + 1e-6)
    const minutes = Math.floor(totalTenths / 600)
    const whole = Math.floor(totalTenths / 10) % 60
    const tenths = totalTenths % 10

    return `${minutes}:${String(whole).padStart(2, '0')}.${tenths}`
}

export class HUD
{
    constructor()
    {
        this.startOverlay = document.querySelector('[data-start]')
        this.startButton = document.querySelector('[data-start-button]')
        this.startHint = document.querySelector('[data-start-hint]')
        this.portfolioButtons = document.querySelectorAll('[data-portfolio-button]')
        this.nameScreen = document.querySelector('[data-name-screen]')
        this.nameForm = document.querySelector('[data-name-form]')
        this.nameInput = document.querySelector('[data-name-input]')
        this.nameHint = document.querySelector('[data-name-hint]')
        this.promptElement = document.querySelector('[data-prompt]')
        this.noticeElement = document.querySelector('[data-notice]')
        this.courseElement = document.querySelector('[data-course]')
        this.lapElement = document.querySelector('[data-lap-time]')
        this.readoutElement = document.querySelector('[data-readout]')
        this.speedElement = document.querySelector('[data-speed]')
        this.throttleElement = document.querySelector('[data-throttle]')
        this.controlsElement = document.querySelector('[data-controls]')
        this.walkControls = document.querySelector('[data-controls-walk]')
        this.rideControls = document.querySelector('[data-controls-ride]')
        this.aimLabel = document.querySelector('[data-aim-label]')
        this.invertLabel = document.querySelector('[data-invert-label]')
        this.crosshairElement = document.querySelector('[data-crosshair]')
        this.cheaterElement = document.querySelector('[data-cheater]')
        this.controlMode = 'walking'
        this.pitchInverted = false

        this.prompt = null
        this.course = null
        this.lapTime = 0
        this.lapRunning = false
        this.lapHold = 0
        this.lapLabel = null
        this.notice = null
        this.noticeTimer = 0
    }

    onStart(callback)
    {
        this.startButton.addEventListener('click', callback)
    }

    /** The "portfolio" buttons on the name and paused screens. */
    onPortfolio(callback)
    {
        for (const button of this.portfolioButtons) button.addEventListener('click', callback)
    }

    hideStart()
    {
        this.startOverlay.classList.add('is-hidden')
        this.setStartHint('')
    }

    setStartHint(text)
    {
        this.startHint.textContent = text ?? ''
        this.startHint.hidden = !text
    }

    showStart()
    {
        this.startOverlay.classList.remove('is-hidden')
    }

    /** `callback(typed)` runs on Enter or the play button. */
    onNameSubmit(callback)
    {
        this.nameForm.addEventListener('submit', (event) =>
        {
            event.preventDefault()
            callback(this.nameInput.value)
        })
        this.nameInput.addEventListener('input', () => this.setNameHint(''))
    }

    showNameScreen(prefill = '')
    {
        this.nameInput.value = prefill
        this.setNameHint('')
        this.nameScreen.classList.remove('is-hidden')
        this.nameInput.focus()
        this.nameInput.select()
    }

    hideNameScreen()
    {
        this.nameScreen.classList.add('is-hidden')
        this.nameInput.blur()
    }

    setNameHint(text)
    {
        this.nameHint.textContent = text ?? ''
        this.nameHint.hidden = !text
    }

    /** The end of a cheated lap: the HUD goes, and "cheater" stays up for good. */
    showCheater()
    {
        this.hideStart()
        this.hideNameScreen()
        document.body.classList.add('is-busted')
        this.cheaterElement.hidden = false
    }

    setPrompt(text)
    {
        if (text === this.prompt) return

        this.prompt = text
        this.promptElement.textContent = text ?? ''
        this.promptElement.classList.toggle('is-visible', Boolean(text))
    }

    setCourse(text)
    {
        if (text === this.course) return

        this.course = text
        this.courseElement.textContent = text ?? ''
        this.courseElement.classList.toggle('is-visible', Boolean(text))
    }

    /** The first ring. The clock shows 0:00.0 and then runs. */
    startLap()
    {
        this.lapTime = 0
        this.lapRunning = true
        this.lapHold = 0
        this.lapElement.classList.remove('is-dq')
        this.#renderLap()
    }

    /** The last ring of the lap. The clock freezes, then stays up for a few seconds. */
    stopLap()
    {
        if (!this.lapRunning) return

        this.lapRunning = false
        this.lapHold = LAP_HOLD
        this.lapElement.classList.remove('is-dq')
        this.#renderLap()
    }

    /**
     * Stepping off before the lap is done. The clock stops and reads DQ,
     * then fades like a finish. Returns false when no lap was running.
     */
    disqualify()
    {
        if (!this.lapRunning) return false

        this.lapRunning = false
        this.lapHold = LAP_HOLD
        this.lapLabel = 'DQ'
        this.lapElement.textContent = 'DQ'
        this.lapElement.classList.add('is-visible', 'is-dq')
        this.lapElement.classList.remove('is-finished')
        return true
    }

    /** Adds the frame while a lap is underway. */
    advanceLap(delta)
    {
        if (!this.lapRunning) return

        this.lapTime += delta
        this.#renderLap()
    }

    #renderLap()
    {
        const text = formatLap(this.lapTime)
        if (text !== this.lapLabel)
        {
            this.lapLabel = text
            this.lapElement.textContent = text
        }

        this.lapElement.classList.add('is-visible')
        this.lapElement.classList.toggle('is-finished', !this.lapRunning)
    }

    setNotice(text, duration = 2.6)
    {
        this.notice = text
        this.noticeTimer = duration
        this.noticeElement.textContent = text
        this.noticeElement.classList.add('is-visible')
    }

    setBoatReadout(speed, throttle)
    {
        this.readoutElement.classList.add('is-visible')
        this.speedElement.textContent = Math.abs(speed * METRES_PER_SECOND_TO_KNOTS).toFixed(1)
        this.throttleElement.style.width = `${Math.abs(throttle) * 100}%`
        this.throttleElement.style.background = throttle < -0.02 ? '#e3a16f' : '#6fe3c4'
    }

    hideBoatReadout()
    {
        this.readoutElement.classList.remove('is-visible')
    }

    setCrosshairVisible(visible)
    {
        this.crosshairElement.classList.toggle('is-hidden', !visible)
    }

    toggleControls()
    {
        this.controlsElement.classList.toggle('is-hidden')
    }

    /** Walking and riding each have their own list. Anything else hides both. */
    setControlMode(mode)
    {
        if (mode === this.controlMode) return

        this.controlMode = mode
        this.walkControls.classList.toggle('is-inactive', mode !== 'walking')
        this.rideControls.classList.toggle('is-inactive', mode !== 'riding')
    }

    /** W and S swap which way the nose pitches. The riding list shows the current way. */
    setPitchInverted(inverted)
    {
        if (inverted === this.pitchInverted) return

        this.pitchInverted = inverted
        this.aimLabel.textContent = inverted ? 'Aim up / down' : 'Aim down / up'
        this.invertLabel.textContent = inverted ? 'Invert up / down · on' : 'Invert up / down'
    }

    update(delta)
    {
        if (!this.lapRunning && this.lapHold > 0)
        {
            this.lapHold -= delta
            if (this.lapHold <= 0)
            {
                this.lapHold = 0
                this.lapLabel = null
                this.lapElement.classList.remove('is-visible', 'is-finished', 'is-dq')
            }
        }

        if (this.noticeTimer <= 0) return

        this.noticeTimer -= delta
        if (this.noticeTimer <= 0)
        {
            this.notice = null
            this.noticeElement.classList.remove('is-visible')
        }
    }
}
