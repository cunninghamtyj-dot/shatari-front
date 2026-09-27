import {
    createElement as ce,
    createText as ct,
    emptyElement as ee,
    productAvailable,
    querySelector as qs
} from "./utils";

import {
    registerCallback as registerLocaleCallback,
    getCurrent as getCurrentLocale,
    getFactionNames,
    getPopulationNames,
    Locale
} from "./Locales";
import Progress from "./Progress";
import * as Types from "./Types";

const REGIONS: Types.Region[] = [
    'usf', 'us',
    'euf', 'eu',
    'twf', 'tw',
    'krf', 'kr',
].filter(region => productAvailable(getRegionProduct(region)));

type ModuleVars = {
    connectedRealms: Record<string, Record<Types.ConnectedRealmID, Types.ConnectedRealm>>;
    realms: Record<Types.RealmID, Types.Realm>;
    lastProduct: Types.Product;
    productChangeCallbacks: Array<(product: Types.Product) => void>,
}

const my: ModuleVars = {
    connectedRealms: {},
    realms: {},
    lastProduct: Types.Product.Mainline,
    productChangeCallbacks: [],
};

/**
 * Methods to handle realms and connected realms.
 */
const Realms = {
    /**
     * Returns the connected realm object for a given realm.
     */
    getConnectedRealm(realm: Types.Realm): Types.ConnectedRealm {
        return getConnectedRealmsForRegion(realm.region)[realm.connectedId];
    },

    getCurrentProduct(): Types.Product {
        return my.lastProduct;
    },

    /**
     * Get a copy of the realm object for the currently-selected realm, or undefined if not found.
     */
    getCurrentRealm(): Types.Realm|undefined {
        const sel = qs('.main .search-bar select') as HTMLSelectElement;
        const realmId = sel.options[sel.selectedIndex].value;

        if (!realmId) {
            return;
        }

        return Realms.getRealm(parseInt(realmId));
    },

    /**
     * Get a copy of the realm object for the given realm ID, or undefined if not found.
     *
     * @param {RealmID} realmId
     * @return {Realm|undefined}
     */
    getRealm(realmId: Types.RealmID): Types.Realm|undefined {
        if (my.realms[realmId]) {
            return {...my.realms[realmId]};
        }
    },

    /**
     * Returns the realm matching the given hash slug, or undefined for no realm.
     */
    getRealmByHash(hashSlug: string): Types.Realm|undefined {
        return Object.values(my.realms).find(realm => hashSlug === Realms.getRealmHash(realm));
    },

    /**
     * Returns the realm's slug which is used in the location hash.
     */
    getRealmHash(realm: Types.Realm): string {
        return `${realm.region}-${realm.slug}`;
    },

    /**
     * Returns a sorted array of connected realms for the given region.
     *
     * @param {Types.Region} region
     * @return {ConnectedRealm[]}
     */
    getRegionConnectedRealms(region: Types.Region): Types.ConnectedRealm[] {
        const result = Object.values(getConnectedRealmsForRegion(region));
        result.sort((a, b) => a.canonical.name.localeCompare(b.canonical.name));

        return result;
    },

    /**
     * Returns a user-facing name for the region.
     *
     * @param {Types.Region} region
     * @return {string}
     */
    getRegionName(region: Types.Region): string {
        return region.substring(0, 2).toUpperCase();
    },

    /**
     * Returns the product enum for the given region.
     *
     * @param {Types.Region} region
     * @return {Types.Product}
     */
    getRegionProduct(region: Types.Region): Types.Product {
        return getRegionProduct(region);
    },

    /**
     * Fetches the realm list data and creates the realm list dropdown.
     */
    async init() {
        await getRealms();

        const select = qs('.main .search-bar select') as HTMLSelectElement;
        select.addEventListener('change', placeholderUsageCheck);
        select.addEventListener('change', productChangeCheck);

        updateSelectNames(parseInt(localStorage.getItem('realm') || '0'));

        placeholderUsageCheck();
        productChangeCheck();

        registerLocaleCallback(onLocaleChange);
    },

    /**
     * Registers a callback for when the product changes. The product is given as the first param.
     */
    registerProductCallback(callback: (product: Types.Product) => void) {
        if (!my.productChangeCallbacks.includes(callback)) {
            my.productChangeCallbacks.push(callback);
        }
    },

    /**
     * Saves the current/given realm to localstorage as the preferred realm.
     */
    savePreferredRealm(realm?: Types.Realm) {
        realm = realm || Realms.getCurrentRealm();
        if (!realm) {
            return;
        }

        try {
            localStorage.setItem('realm', `${realm.id}`);
        } catch (e) {
            // Ignore
        }
    },

    /**
     * Changes the currently-selected realm to the given realm.
     */
    setCurrentRealm(realm: Types.Realm) {
        const select = qs('.main .search-bar select') as HTMLSelectElement;
        let option = select.querySelector(`option[value="${realm.id}"]:not([data-native])`) as HTMLOptionElement|undefined;
        if (option) {
            option.selected = true;
        }

        placeholderUsageCheck();
    },
};
export default Realms;

/**
 * Returns the connected realms for a region, keyed by connected realm ID.
 */
function getConnectedRealmsForRegion(region: Types.Region): Record<Types.ConnectedRealmID, Types.ConnectedRealm> {
    let result = my.connectedRealms[region];
    if (result) {
        return result;
    }

    result = {};
    Object.values(my.realms)
        .filter(realm => realm.region === region)
        .forEach(realm => {
            if (!result.hasOwnProperty(realm.connectedId)) {
                result[realm.connectedId] = {
                    region: realm.region,
                    id: realm.connectedId,
                    secondary: [],
                    canonical: realm,
                };
            }
            if (realm.id === realm.connectedId) {
                result[realm.connectedId].canonical = realm;
            } else {
                result[realm.connectedId].secondary.push(realm);
            }
        });

    Object.values(result).forEach(connectedRealm => {
        // If we never found the canonical, we would've made the first "secondary" the canonical.
        if (connectedRealm.secondary[0]?.id === connectedRealm.canonical.id) {
            // Remove the canonical from the secondary list.
            connectedRealm.secondary.shift();
        }
        connectedRealm.secondary.sort((a, b) => a.name.localeCompare(b.name));
    });

    return my.connectedRealms[region] = result;
}

/**
 * Fetches the realm list and stores it locally.
 */
async function getRealms() {
    const localeCode = getCurrentLocale();

    const responses = await Promise.all([
        Progress.fetch('json/realms/realm-list.json', {mode: 'same-origin'}),
        Progress.fetch(`json/realms/realm-names.${localeCode}.json`, {mode: 'same-origin'}),
    ]);

    if (!responses[0].ok) {
        throw 'Cannot get list of realms!';
    }
    if (!responses[1].ok) {
        throw 'Cannot get list of realm names!';
    }

    const allRealms: Record<Types.RealmID, Omit<Types.Realm, 'product'>> = await responses[0].json();
    my.realms = Object.fromEntries(
        Object.entries(allRealms)
            .filter(([realmId, realm]) => REGIONS.includes(realm.region))
            .map(([realmId, realm]) => [realmId, {product: getRegionProduct(realm.region), ...realm}])
    );
    setNames(await responses[1].json());
}

/**
 * Returns the product for the given region.
 *
 * @param {Types.Region} region
 * @return {Types.Product}
 */
function getRegionProduct(region: Types.Region): Types.Product {
    return /^\w\wf$/.test(region) ? Types.Product.Forever : Types.Product.Mainline;
}

/**
 * Returns the user-facing English name for the region's product.
 *
 * @param {Types.Region} region
 * @return {string}
 */
function getRegionProductName(region: Types.Region): string {
    const nameMap: Record<Types.Product, string> = {
        [Types.Product.Forever]: 'Forever',
        [Types.Product.Mainline]: 'Midnight',
    };

    if ((Object.keys(nameMap) as Types.Product[]).filter(productAvailable).length < 2) {
        return '';
    }

    return nameMap[getRegionProduct(region)];
}

/**
 * Called when the user changes their preferred locale, this updates the UI with the new names.
 */
async function onLocaleChange(locale: Locale) {
    const response = await Progress.fetch(`json/realms/realm-names.${locale}.json`, {mode: 'same-origin'});
    if (!response.ok) {
        throw 'Could not load realm names in locale ' + locale;
    }

    setNames(await response.json());
    updateSelectNames();
}

/**
 * Removes the "Select a realm" placeholder from the realm dropdown once it's no longer needed.
 */
function placeholderUsageCheck() {
    const select = qs('.main .search-bar select') as HTMLSelectElement;
    if (!select.options[0].value) {
        if (select.selectedIndex !== 0) {
            select.removeChild(select.options[0]);
            select.removeEventListener('change', placeholderUsageCheck);
        }
    } else {
        select.removeEventListener('change', placeholderUsageCheck);
    }
}

/**
 * Fires product change callbacks if the product changed since our last check.
 */
function productChangeCheck() {
    const realm = Realms.getCurrentRealm();
    if (realm && realm.product !== my.lastProduct) {
        my.lastProduct = realm.product;
        my.productChangeCallbacks.forEach(f => f(realm.product));
    }
}

/**
 * Sets the names and categories of our cached realms using the given dictionary.
 */
function setNames(names: Record<Types.RealmID, {name: string, category: string, nativeName?: string}>) {
    const popNames = getPopulationNames();
    const factionNames = getFactionNames();

    Object.values(my.realms).forEach(realm => {
        const factionName = realm.faction ? ` ${factionNames[realm.product][realm.faction]}` : '';
        const nameRec = names[realm.id];
        realm.name = (nameRec?.name || ('Realm ' + realm.id)) + factionName;
        if (nameRec?.nativeName) {
            realm.nativeName = nameRec.nativeName + factionName;
        } else {
            delete realm.nativeName;
        }
        realm.category = nameRec?.category || '';
        realm.populationName = popNames[realm.product][realm.population] || '';
    });
}

/**
 * Updates the realm select box options with their names for the current locale.
 */
function updateSelectNames(savedRealmId?: Types.RealmID) {
    savedRealmId ??= (Realms.getCurrentRealm() || {}).id;

    const select = qs('.main .search-bar select') as HTMLSelectElement;

    if (!select.querySelector('optgroup')) {
        REGIONS.forEach(region => {
            select.appendChild(ce('optgroup', {
                dataset: {region},
                label: [Realms.getRegionName(region), getRegionProductName(region), 'Realms']
                    .filter(str => !!str).join(' '),
            }));
        });
    }

    select.querySelectorAll('option[data-native]').forEach(option => option.parentNode?.removeChild(option));

    const sorted: Array<Types.Realm & {fromNative?: boolean}> = [];
    Object.values(my.realms).forEach(realm => {
        sorted.push(realm);
        if (realm.nativeName) {
            sorted.push({
                ...realm,
                name: realm.nativeName,
                fromNative: true,
            });
        }
    });
    sorted.sort((a, b) => {
        return a.name.localeCompare(b.name) || (REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region));
    });

    let optGroup = select.querySelector('optgroup') as HTMLOptGroupElement;
    const seenNames: Record<string, HTMLOptionElement|true> = {};
    sorted.forEach(realm => {
        let option: HTMLOptionElement|null = realm.fromNative ? null :
            select.querySelector(`option[value="${realm.id}"]:not([data-native])`);
        if (option) {
            ee(option);
        } else {
            option = ce('option', {value: realm.id});
        }
        if (realm.fromNative) {
            option.dataset.native = 'true';
        }
        option.label = realm.name;

        const seenOpt = seenNames[realm.name];
        if (seenOpt) {
            if (seenOpt !== true) {
                seenOpt.label += ' ' + Realms.getRegionName(my.realms[parseInt(seenOpt.value)]?.region);
                ee(seenOpt);
                seenOpt.appendChild(ct(seenOpt.label));

                seenNames[realm.name] = true;
            }
            option.label += ' ' + Realms.getRegionName(realm.region);
        } else {
            seenNames[realm.name] = option;
        }
        option.appendChild(ct(option.label));

        if (!realm.fromNative && realm.id === savedRealmId) {
            option.selected = true;
        }

        if (optGroup.dataset.region !== realm.region) {
            optGroup = select.querySelector(`optgroup[data-region="${realm.region}"]`) ?? optGroup;
        }

        optGroup.appendChild(option);
    });
}
