/**
 * Methods to handle locale changes, to show localized names and fields.
 */

import {createElement as ce, querySelector as qs} from "./utils";
import Progress from "./Progress";
import {FactionSlug, Product} from "./Types";
import Realms from "./Realms";

export enum Locale {
    enus = 'enus',
    dede = 'dede',
    eses = 'eses',
    esmx = 'esmx',
    frfr = 'frfr',
    itit = 'itit',
    ptbr = 'ptbr',
    ruru = 'ruru',
    zhtw = 'zhtw',
    kokr = 'kokr',
}

export enum GlobalString {
    ClickToViewDetails = 'PROFESSIONS_SPECIALIZATION_VIEW_DETAILS',
    PopulationLocked = 'REALM_LOCKED',
    PopulationNew = 'LOAD_NEW',
    PopulationNewPlayers = 'LOAD_RECOMMENDED',
    PopulationLow = 'LOAD_LOW',
    PopulationMedium = 'LOAD_MEDIUM',
    PopulationHigh = 'LOAD_HIGH',
    PopulationFull = 'LOAD_FULL',
    FactionAlliance = 'FACTION_ALLIANCE',
    FactionHorde = 'FACTION_HORDE',
    FactionNeutral = 'FACTION_NEUTRAL',
}

const NAMES: {[key in Locale]: string} = {
    enus: 'English',
    dede: 'Deutsch',
    eses: 'Español',
    esmx: 'Español (Latino)',
    frfr: 'Français',
    itit: 'Italiano',
    ptbr: 'Português',
    ruru: 'Русский',
    zhtw: '中文',
    kokr: '한국어',
};

const WOWHEAD_DOMAINS: {[key in Locale]: string} = {
    enus: 'www',
    dede: 'de',
    eses: 'es',
    esmx: 'mx',
    frfr: 'fr',
    itit: 'it',
    ptbr: 'pt',
    ruru: 'ru',
    zhtw: 'tw',
    kokr: 'ko',
};

type ModuleVars = {
    changeCallbacks: Array<(locale: Locale) => void>,
    globalStrings: Record<Product, Record<GlobalString, string>>,
    locale: Locale,
}
const my: ModuleVars = {
    changeCallbacks: [],
    globalStrings: {} as Record<Product, Record<GlobalString, string>>,
    locale: Locale.enus,
};

/**
 * Returns the current 4-letter lowercase locale code.
 */
export const getCurrent = (): Locale => my.locale;

/**
 * Returns a map of localized faction names per product.
 */
export const getFactionNames = (): Record<Product, Record<FactionSlug, string>> => {
    const entries = Object.values(Product)
        .map(product => [product, {
            [FactionSlug.Alliance]: my.globalStrings[product][GlobalString.FactionAlliance],
            [FactionSlug.Horde]: my.globalStrings[product][GlobalString.FactionHorde],
            [FactionSlug.Neutral]: my.globalStrings[product][GlobalString.FactionNeutral],
        }]);

    return Object.fromEntries(entries);
};

/**
 * Returns a map of product => global string => localized string.
 */
export const getGlobalStrings = (): Record<Product, Record<GlobalString, string>> => my.globalStrings;

/**
 * Returns a map of global string => localized string for the current/given product.
 */
export const getProductGlobalStrings = (product?: Product): Record<GlobalString, string> =>
    my.globalStrings[product ?? Realms.getCurrentProduct()];

/**
 * Returns an ordered list of localized population names per product.
 */
export const getPopulationNames = (): Record<Product, [string, string, string, string, string, string, string, string]> => {
    const entries = Object.values(Product)
        .map(product => [product, [
            '',
            my.globalStrings[product][GlobalString.PopulationNew],
            my.globalStrings[product][GlobalString.PopulationNewPlayers],
            my.globalStrings[product][GlobalString.PopulationLow],
            my.globalStrings[product][GlobalString.PopulationMedium],
            my.globalStrings[product][GlobalString.PopulationHigh],
            my.globalStrings[product][GlobalString.PopulationFull],
            my.globalStrings[product][GlobalString.PopulationLocked],
        ]]);

    return Object.fromEntries(entries);
};

/**
 * Returns the Wowhead subdomain for the current locale.
 */
export const getWowheadDomain = (): string => WOWHEAD_DOMAINS[my.locale];

/**
 * Returns the Wowhead path prefix for the current locale.
 */
export const getWowheadPathPrefix = (): string => my.locale === Locale.enus ? '' : (getWowheadDomain() + '/');

/**
 * Sets up any controls and reads the user's preferred locale from local storage.
 */
export async function init() {
    let storedLocale = localStorage.getItem('locale') ?? '';
    if (isLocale(storedLocale)) {
        my.locale = storedLocale;
    }

    await loadGlobalStrings();

    const sel = qs('.main .bottom-bar select.locales') as HTMLSelectElement;
    Object.values(Locale).forEach(locale => {
        sel.appendChild(ce('option', {
            value: locale,
            label: NAMES[locale],
            selected: locale === my.locale,
        }, document.createTextNode(NAMES[locale])));
    });
    sel.addEventListener('change', () => changeLocale(sel));
}

/**
 * Registers a callback function for when the locale changes. The new locale is given as the first param.
 */
export function registerCallback(callback: (locale: Locale) => void) {
    if (!my.changeCallbacks.includes(callback)) {
        my.changeCallbacks.push(callback);
    }
}

/**
 * Change the locale to the currently-selected locale in the given select element.
 */
async function changeLocale(sel: HTMLSelectElement) {
    const chosenLocale = sel.options[sel.selectedIndex].value;
    if (!isLocale(chosenLocale)) {
        return;
    }

    my.locale = chosenLocale;

    try {
        localStorage.setItem('locale', my.locale);
    } catch (e) {
        // Ignore
    }

    await loadGlobalStrings();

    my.changeCallbacks.forEach(f => f(my.locale));
}

/**
 * Returns whether the given string is a valid locale enum value.
 */
function isLocale(value: string): value is Locale {
    return Object.values(Locale).includes(value as Locale);
}

/**
 * Loads globalstrings for all products into memory.
 */
async function loadGlobalStrings() {
    const locale = getCurrent();

    await Promise.all(Object.values(Product)
        .map(async product => {
            const response = await Progress.fetch(`json/${product}/globalStrings.${locale}.json`, {mode: 'same-origin'});
            if (!response.ok) {
                throw `Cannot get list of global strings for [${product}] [${locale}]!`;
            }
            my.globalStrings[product] = await response.json();
        }));
}
