import { PORTFOLIO_URL } from '../config.js'

/** The leaving animation runs at least this long, so it never just flickers. */
const MIN_SECONDS = 1.5
/** Go anyway after this long, even if the portfolio has not finished loading. */
const MAX_SECONDS = 10

/**
 * Loads the portfolio in a hidden, full-size frame so its page, styles,
 * images and videos land in the browser cache, then resolves. Navigating
 * there afterwards is then close to instant.
 *
 * Resolves after MIN_SECONDS at the earliest and MAX_SECONDS at the latest.
 */
export function preloadPortfolio()
{
    const frame = document.createElement('iframe')
    frame.src = PORTFOLIO_URL
    frame.title = 'portfolio (loading)'
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    // Full size, so lazy images inside count as on screen; off to the side, so it is never seen.
    Object.assign(frame.style, {
        position: 'fixed',
        left: '-200vw',
        top: '0',
        width: '100vw',
        height: '100vh',
        border: '0',
        visibility: 'hidden',
        pointerEvents: 'none'
    })

    const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }))
    const atLeast = wait(MIN_SECONDS)
    const atMost = wait(MAX_SECONDS)

    document.body.appendChild(frame)

    return Promise.race([Promise.all([loaded, atLeast]), atMost])
}

/** Off to the portfolio for real. */
export function goToPortfolio()
{
    window.location.assign(PORTFOLIO_URL)
}

function wait(seconds)
{
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}
