/**
 * Alliance/Horde color theme switcher.
 *
 * The theme is the data-faction attribute on <html>; public/faction.js applies the saved choice before first paint.
 */

import {querySelector as qs} from "./utils";

export enum Faction {
    Alliance = 'alliance',
    Horde = 'horde',
}

const STORAGE_KEY = 'faction';

const changeCallbacks: Array<(faction: Faction) => void> = [];

/**
 * Returns the current faction theme.
 */
export function getCurrent(): Faction {
    return document.documentElement.dataset.faction === Faction.Horde ? Faction.Horde : Faction.Alliance;
}

/**
 * Returns the value of a theme color custom property (e.g. 'chart-price') for the current faction.
 */
export function getColor(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

/**
 * Returns a theme color (a hex custom property, e.g. 'chart-price') as an rgba() string with the given opacity.
 */
export function getColorRgba(name: string, alpha: number): string {
    const hex = getColor(name).replace('#', '');
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(full.substring(i, i + 2), 16));

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Registers a function to run whenever the faction theme changes.
 */
export function registerChangeCallback(callback: (faction: Faction) => void) {
    changeCallbacks.push(callback);
}

/**
 * Switches to the given faction theme and remembers it.
 */
export function set(faction: Faction) {
    document.documentElement.dataset.faction = faction;
    try {
        localStorage.setItem(STORAGE_KEY, faction);
    } catch (e) {
        // Storage unavailable: the theme still applies for this page view.
    }
    updateButton();
    changeCallbacks.forEach(f => f(faction));
}

/**
 * Hooks up the switcher button in the search bar.
 */
export function init() {
    const button = qs('.search-bar .faction') as HTMLElement|null;
    button?.addEventListener('click', () => set(getCurrent() === Faction.Horde ? Faction.Alliance : Faction.Horde));
    updateButton();
}

function updateButton() {
    const button = qs('.search-bar .faction') as HTMLElement|null;
    if (!button) {
        return;
    }
    const other = getCurrent() === Faction.Horde ? 'Alliance' : 'Horde';
    button.dataset.simpleTooltip = `For the ${getCurrent() === Faction.Horde ? 'Horde' : 'Alliance'}! Click to switch to ${other} colors.`;
    button.setAttribute('aria-label', `Switch to ${other} colors`);
}
