// Azeroth Exchange: Flip Finder (not in upstream Project Shatari).
// Compares the realms a visitor has characters on, and lists non-stackable items that are cheap on one of those
// realms and sell for more on another. Items move between realms through the Warband Bank.
import {COPPER_GOLD, ITEM_PET_CAGE} from "./constants";
import {
    createElement as ce,
    createText as ct,
    priceElement,
    querySelector as qs,
} from "./utils";

import Auctions from "./Auctions";
import Detail from "./Detail";
import Hash from "./Hash";
import * as Items from "./Items";
import Realms from "./Realms";
import * as Types from "./Types";

/** The auction house keeps 5% of each sale. */
const AH_CUT = 0.05;
/** An item must be listed on at least this many realms in the region (or half the region's realms, if fewer). */
const MIN_REGION_REALMS = 5;
/** Region medians at or above this are troll listings near the auction house's 9,999,999g maximum. */
const MAX_REALISTIC_PRICE = 9_000_000 * COPPER_GOLD;
const MAX_REALMS = 10;
const MAX_RESULTS_SHOWN = 500;

type Settings = {
    realms: Types.ConnectedRealmID[];
    minProfitGold: number;
    minMarginPercent: number;
    includeUnlisted: boolean;
};

type Flip = {
    item: Types.PricedItem;
    buyRealm: Types.Realm;
    buyPrice: Types.Money;
    sellRealm: Types.Realm;
    sellPrice: Types.Money;
    sellNote: '' | 'none listed';
    profit: Types.Money;
    margin: number;
    typical: Types.Money;
};

type SortKey = 'name' | 'buy' | 'sell' | 'profit' | 'margin';

const DEFAULT_SETTINGS: Settings = {realms: [], minProfitGold: 100, minMarginPercent: 20, includeUnlisted: false};

const my: {flips: Flip[]; sortKey: SortKey; sortDesc: boolean} = {
    flips: [],
    sortKey: 'profit',
    sortDesc: true,
};

/**
 * Returns the saved Flip Finder settings for the given region.
 */
function getSettings(region: Types.Region): Settings {
    try {
        const saved = JSON.parse(localStorage.getItem(`flip-settings-${region}`) || '{}');

        return {
            realms: Array.isArray(saved.realms) ? saved.realms.filter((id: unknown) => typeof id === 'number') : [],
            minProfitGold: typeof saved.minProfitGold === 'number' ? saved.minProfitGold : DEFAULT_SETTINGS.minProfitGold,
            minMarginPercent: typeof saved.minMarginPercent === 'number' ? saved.minMarginPercent : DEFAULT_SETTINGS.minMarginPercent,
            includeUnlisted: saved.includeUnlisted === true,
        };
    } catch (e) {
        return {...DEFAULT_SETTINGS};
    }
}

function saveSettings(region: Types.Region, settings: Settings) {
    try {
        localStorage.setItem(`flip-settings-${region}`, JSON.stringify(settings));
    } catch (e) {
        // Storage unavailable: the settings last until the page is closed.
    }
}

/**
 * Returns the realms to compare: the current realm plus the saved ones, as one realm object per connected realm.
 */
function getChosenRealms(current: Types.Realm, settings: Settings): Types.Realm[] {
    const byConnected = new Map<Types.ConnectedRealmID, Types.Realm>();
    byConnected.set(current.connectedId, current);
    const connectedRealms = Realms.getRegionConnectedRealms(current.region);
    for (const id of settings.realms) {
        const connected = connectedRealms.find(cr => cr.id === id);
        if (connected && !byConnected.has(id)) {
            byConnected.set(id, connected.canonical);
        }
    }

    return [...byConnected.values()].slice(0, MAX_REALMS);
}

/**
 * Finds flips among the given (already searched and filtered) items.
 */
async function findFlips(items: Types.Item[], realms: Types.Realm[], settings: Settings): Promise<Flip[]> {
    const nonStackable = items.filter(item => (item.stack ?? 1) <= 1);
    const [states, regionWide, deals] = await Promise.all([
        Promise.all(realms.map(realm => Auctions.getRealmStateFor(realm))),
        // In arbitrage mode, quantity is the percentage of the region's realms with the item for sale.
        Auctions.hydrateList(nonStackable, {arbitrage: true}),
        // Region prices from the back end's deals scan (only items usually worth 150g or more).
        Auctions.getDeals(realms[0]),
    ]);
    const regionRealmCount = Realms.getRegionConnectedRealms(realms[0].region).length;
    const minListedPercent = 100 * Math.min(MIN_REGION_REALMS, Math.ceil(regionRealmCount / 2)) / regionRealmCount;

    const minProfit = settings.minProfitGold * COPPER_GOLD;
    const minMargin = settings.minMarginPercent / 100;
    const result: Flip[] = [];

    for (const item of regionWide) {
        const key = Items.stringifyKeyParts(item.id, item.bonusLevel, item.bonusSuffix);
        const region = deals.items[key];
        // Listings are asking prices, not sales. Many rare items are listed everywhere at prices nobody pays, so
        // use the price the cheapest third of realms ask (the back end's "deal price") as what it really sells for.
        const typical = region?.dealPrice;
        // (Current-expansion gear with item-level variants has no region listing count: quantity 0 means unknown.)
        if (!typical || region.regionMedian >= MAX_REALISTIC_PRICE || (item.quantity > 0 && item.quantity < minListedPercent)) {
            // No trustworthy region price: too few realms list it, or the listings are trolls.
            continue;
        }

        // Current lowest in-stock price on each chosen realm (0 = none listed now).
        const prices = states.map(state => {
            const line = state.summary[key];

            return line && line.quantity > 0 && line.snapshot === state.snapshot ? line.price : 0;
        });

        let buyIndex = -1;
        prices.forEach((price, index) => {
            if (price > 0 && (buyIndex < 0 || price < prices[buyIndex])) {
                buyIndex = index;
            }
        });
        if (buyIndex < 0 || prices[buyIndex] >= typical) {
            // Not for sale on any chosen realm, or not cheaper than it usually sells for.
            continue;
        }
        const buyPrice = prices[buyIndex];

        let best: Flip | undefined;
        prices.forEach((price, index) => {
            if (index === buyIndex || (price === 0 && !settings.includeUnlisted)) {
                return;
            }
            // Undercut the cheapest listing there, but never count on selling above the typical price.
            const sellPrice = price > 0 ? Math.min(price, typical) : typical;
            const sellNote: Flip['sellNote'] = price > 0 ? '' : 'none listed';
            const profit = Math.floor(sellPrice * (1 - AH_CUT)) - buyPrice;
            if (!best || profit > best.profit) {
                best = {
                    item,
                    buyRealm: realms[buyIndex],
                    buyPrice,
                    sellRealm: realms[index],
                    sellPrice,
                    sellNote,
                    profit,
                    margin: profit / buyPrice,
                    typical,
                };
            }
        });

        if (best && best.profit >= minProfit && best.margin >= minMargin) {
            result.push(best);
        }
    }

    return result;
}

/**
 * Returns the display name for an item, with its suffix and item level.
 */
function getItemName(item: Types.Item): string {
    let name = item.name;
    if (item.bonusSuffix) {
        const suffix = Items.getSuffix(item.id, item.bonusSuffix);
        if (suffix) {
            name += ` ${suffix.name}`;
        }
    }
    if (item.bonusLevel && item.id !== ITEM_PET_CAGE) {
        name += ` (${item.bonusLevel})`;
    }

    return name;
}

function realmPrice(realm: Types.Realm, price: Types.Money, note?: string): HTMLTableCellElement {
    const td = ce('td', {className: 'flip-price'});
    td.appendChild(priceElement(price));
    const div = ce('div', {className: 'flip-realm'}, ct(realm.name));
    if (note) {
        div.appendChild(ce('span', {className: 'flip-note'}, ct(note)));
    }
    td.appendChild(div);

    return td;
}

function sortFlips() {
    const dir = my.sortDesc ? -1 : 1;
    my.flips.sort((a, b) => {
        let diff = 0;
        switch (my.sortKey) {
            case 'name': diff = getItemName(a.item).localeCompare(getItemName(b.item)); break;
            case 'buy': diff = a.buyPrice - b.buyPrice; break;
            case 'sell': diff = a.sellPrice - b.sellPrice; break;
            case 'profit': diff = a.profit - b.profit; break;
            case 'margin': diff = a.margin - b.margin; break;
        }

        return diff * dir || b.profit - a.profit;
    });
}

/**
 * Draws the results table into the given element.
 */
function renderTable(parent: HTMLElement) {
    parent.querySelector('table.flips')?.remove();
    const table = ce('table', {className: 'flips'});
    parent.appendChild(table);

    const thead = ce('thead');
    const headRow = ce('tr');
    thead.appendChild(headRow);
    table.appendChild(thead);
    const columns: [SortKey, string][] = [
        ['name', 'Item'], ['buy', 'Buy on'], ['sell', 'Sell on'], ['profit', 'Profit'], ['margin', 'Margin'],
    ];
    for (const [key, label] of columns) {
        const td = ce('td', {dataset: {colName: key}}, ct(label));
        if (my.sortKey === key) {
            td.dataset.sort = my.sortDesc ? 'desc' : 'asc';
        }
        td.addEventListener('click', () => {
            my.sortDesc = my.sortKey === key ? !my.sortDesc : key !== 'name';
            my.sortKey = key;
            sortFlips();
            renderTable(parent);
        });
        headRow.appendChild(td);
    }

    const tbody = ce('tbody');
    table.appendChild(tbody);
    if (!my.flips.length) {
        const td = ce('td', {colSpan: columns.length},
            ct('No flips found right now. Try adding realms, lowering the minimums, or changing your search and category.'));
        tbody.appendChild(ce('tr', {className: 'message'}, td));

        return;
    }

    for (const flip of my.flips.slice(0, MAX_RESULTS_SHOWN)) {
        const tr = ce('tr', {className: 'result'});
        tr.addEventListener('click', event => {
            event.preventDefault();
            Detail.show(Auctions.strip(flip.item), flip.buyRealm);
        });

        const name = ce('td', {className: 'name'});
        const link = ce('a', {href: '#' + Hash.getItemDetailHash(flip.item, flip.buyRealm)});
        link.addEventListener('click', event => event.preventDefault());
        link.appendChild(ce('img', {
            className: 'icon',
            loading: 'lazy',
            src: Items.getIconUrl(flip.item.icon, Items.IconSize.Medium),
        }));
        link.appendChild(ce('span', {className: 'q' + flip.item.quality}, ct(getItemName(flip.item))));
        name.appendChild(link);
        tr.appendChild(name);

        tr.appendChild(realmPrice(flip.buyRealm, flip.buyPrice));
        tr.appendChild(realmPrice(flip.sellRealm, flip.sellPrice, flip.sellNote));

        const profit = ce('td', {className: 'flip-profit'});
        profit.appendChild(priceElement(flip.profit));
        tr.appendChild(profit);
        tr.appendChild(ce('td', {className: 'flip-margin'}, ct(Math.round(flip.margin * 100) + '%')));

        tbody.appendChild(tr);
    }
    if (my.flips.length > MAX_RESULTS_SHOWN) {
        const td = ce('td', {colSpan: columns.length},
            ct(`Showing the top ${MAX_RESULTS_SHOWN} of ${my.flips.length.toLocaleString()} flips.`));
        tbody.appendChild(ce('tr', {className: 'message'}, td));
    }
}

/**
 * Draws the "My realms" panel. Calls onSave after the visitor saves new settings.
 */
function renderPanel(parent: HTMLElement, current: Types.Realm, settings: Settings, open: boolean, onSave: () => void) {
    const panel = ce('div', {className: 'flip-settings'});
    parent.appendChild(panel);

    const chosen = getChosenRealms(current, settings);
    const summary = ce('div', {className: 'flip-summary'});
    summary.appendChild(ct(
        `Comparing ${chosen.map(realm => realm.name).join(', ')} · ` +
        `at least ${settings.minProfitGold.toLocaleString()}g profit and ${settings.minMarginPercent}% margin, ` +
        `after the 5% auction house cut. Sell prices never go above what the cheapest third of the region's realms ` +
        `ask, and items must be listed on at least ${MIN_REGION_REALMS} realms` +
        (settings.includeUnlisted ? '' : `; realms where nobody is selling the item are skipped`) + `. `
    ));
    const toggle = ce('a', {className: 'flip-edit', href: '#'}, ct('Change my realms'));
    summary.appendChild(toggle);
    panel.appendChild(summary);

    const editor = ce('div', {className: 'flip-editor'});
    editor.hidden = !open;
    panel.appendChild(editor);
    toggle.addEventListener('click', event => {
        event.preventDefault();
        editor.hidden = !editor.hidden;
    });

    editor.appendChild(ce('p', {}, ct(
        'Pick the realms you have characters on (up to ' + MAX_REALMS + '). ' +
        'Items move between them through your Warband Bank. Only items that don\'t stack can be flipped; ' +
        'stackable goods share one auction house across the region.'
    )));

    const filter = ce('input', {type: 'search', placeholder: 'Filter realms', className: 'flip-filter'});
    editor.appendChild(filter);

    const list = ce('div', {className: 'flip-realm-list'});
    editor.appendChild(list);
    const selected = new Set(chosen.map(realm => realm.connectedId));
    const connectedRealms = Realms.getRegionConnectedRealms(current.region)
        .filter(cr => cr.canonical.connectedId < 0x7F00)
        .sort((a, b) => a.canonical.name.localeCompare(b.canonical.name));
    for (const cr of connectedRealms) {
        const names = [cr.canonical, ...cr.secondary].map(realm => realm.name).join(', ');
        const checkbox = ce('input', {type: 'checkbox', checked: selected.has(cr.id), disabled: cr.id === current.connectedId});
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                if (selected.size >= MAX_REALMS) {
                    checkbox.checked = false;
                    alert(`You can compare up to ${MAX_REALMS} realms.`);

                    return;
                }
                selected.add(cr.id);
            } else {
                selected.delete(cr.id);
            }
        });
        const label = ce('label', {dataset: {names: names.toLowerCase()}}, checkbox);
        label.appendChild(ct(' ' + names));
        list.appendChild(label);
    }
    filter.addEventListener('input', () => {
        const term = filter.value.trim().toLowerCase();
        list.querySelectorAll('label').forEach(label => {
            (label as HTMLElement).hidden = term !== '' && !(label.dataset.names ?? '').includes(term);
        });
    });

    const numbers = ce('div', {className: 'flip-minimums'});
    const minProfit = ce('input', {type: 'number', min: '0', step: '10', value: `${settings.minProfitGold}`});
    const minMargin = ce('input', {type: 'number', min: '0', step: '5', value: `${settings.minMarginPercent}`});
    numbers.appendChild(ce('label', {}, ct('Minimum profit (gold) ')));
    numbers.lastChild!.appendChild(minProfit);
    numbers.appendChild(ce('label', {}, ct('Minimum margin (%) ')));
    numbers.lastChild!.appendChild(minMargin);
    const unlisted = ce('input', {type: 'checkbox', checked: settings.includeUnlisted});
    const unlistedLabel = ce('label', {}, unlisted);
    unlistedLabel.appendChild(ct(' Include realms where nobody is selling the item (riskier: no one to compare against)'));
    numbers.appendChild(unlistedLabel);
    editor.appendChild(numbers);

    const save = ce('button', {type: 'button'}, ct('Save and find flips'));
    save.addEventListener('click', () => {
        saveSettings(current.region, {
            realms: [...selected],
            minProfitGold: Math.max(0, parseFloat(minProfit.value) || 0),
            minMarginPercent: Math.max(0, parseFloat(minMargin.value) || 0),
            includeUnlisted: unlisted.checked,
        });
        onSave();
    });
    editor.appendChild(save);
}

const Flips = {
    /**
     * Runs the Flip Finder over the given search results and shows it in the search result area.
     */
    async perform(items: Types.Item[], onSettingsSaved: () => void): Promise<void> {
        const current = Realms.getCurrentRealm();
        const parent = qs('.main .search-result-target') as HTMLElement | null;
        if (!current || !parent) {
            return;
        }

        const settings = getSettings(current.region);
        const realms = getChosenRealms(current, settings);
        const needsRealms = realms.length < 2;

        renderPanel(parent, current, settings, needsRealms, onSettingsSaved);
        if (needsRealms) {
            parent.appendChild(ce('div', {className: 'flip-intro'}, ct(
                'Choose at least one other realm you play on, then save, to find items that are cheap on one of your ' +
                'realms and sell for more on another.'
            )));

            return;
        }

        my.flips = await findFlips(items, realms, settings);
        sortFlips();
        renderTable(parent);
    },
};
export default Flips;
