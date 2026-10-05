// Applies the visitor's saved faction theme before the page draws, so there's no flash of the wrong colors.
try {
    if (localStorage.getItem('faction') === 'horde') {
        document.documentElement.dataset.faction = 'horde';
    }
} catch (e) {
    // Storage unavailable: stay on the default (Alliance).
}
