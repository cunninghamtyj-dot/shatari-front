/**
 * Account state.
 *
 * Azeroth Exchange has no accounts or paid tiers: every visitor gets the full feature set that Undermine Exchange
 * reserved for paying supporters. isPaid() is kept so the original feature checks still read naturally.
 */

import Detail from "./Detail";
import Search from "./Search";
import {querySelector as qs} from "./utils";

let welcomeElement: HTMLDivElement|null;

/**
 * Returns to the welcome page. (Upstream used this to advertise supporter benefits; everything is unlocked here.)
 */
export const showBenefitsText = (event?: MouseEvent) => {
    event && event.preventDefault();

    Detail.hide();
    Search.hide();
    WH.Tooltips.hide();
    (qs('.main .welcome') as HTMLElement).style.display = '';

    welcomeElement && welcomeElement.scrollIntoView();
};

/**
 * Every visitor has full access.
 */
export const isPaid = (): boolean => true;

export async function init(): Promise<void> {
    welcomeElement = qs('.welcome') as HTMLDivElement|null;

    (qs('.main') as HTMLDivElement).dataset.account = 'paid';

    (qs('.main .search-bar .filter') as HTMLAnchorElement)
        .querySelectorAll(':scope > div input, :scope > div select')
        .forEach(ele => (ele as HTMLInputElement|HTMLSelectElement).disabled = false);
}
