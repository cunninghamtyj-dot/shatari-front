import "@fontsource/cinzel/700.css";
import "@fontsource/marcellus/400.css";
import "@fontsource/archivo-narrow/400.css";
import "@fontsource/archivo-narrow/700.css";

import {createElement as ce, querySelector as qs, updateDeltaTimestamps} from "./utils";
import {MS_MINUTE} from "./constants";

import * as Account from "./Account";
import Auctions from "./Auctions";
import Categories from "./Categories";
import Detail from "./Detail";
import * as Faction from "./Faction";
import Hash from "./Hash";
import {init as ItemsInit} from "./Items";
import {init as LocalesInit} from "./Locales";
import Realms from "./Realms";
import Search from "./Search";

async function init() {
    const welcome = qs('.main .welcome') as HTMLElement|null;
    const inMaintenance = !!welcome?.dataset.maintenance;
    if (inMaintenance) {
        return;
    }

    Faction.init();

    let hsTag = ce('script', {
        src: 'highstock-10.3.3.js',
        id: 'highstock-script',
    });
    hsTag.addEventListener('load', () => hsTag.dataset.loaded = '1');
    document.head.appendChild(hsTag);

    document.head.appendChild(ce('script', {src: 'power.js'}));

    if (!('userAgentData' in navigator) &&
        navigator.userAgent.indexOf('Safari') > -1 &&
        navigator.userAgent.indexOf('Chrome') < 0 &&
        navigator.userAgent.indexOf('Chromium') < 0
    ) {
        // Safari applies TR backgrounds to each TD.
        document.body.classList.add('no-row-backgrounds');
    }

    const fsDiv = qs('.main .welcome .full-screen') as HTMLElement;
    const doc = document as Document & {webkitFullscreenEnabled?: boolean};
    if (
        (document.fullscreenEnabled || doc.webkitFullscreenEnabled) &&
        (window.innerWidth === window.screen.availWidth || window.innerHeight === window.screen.availHeight)
    ) {
        fsDiv.style.display = '';
        fsDiv.querySelector('button')?.addEventListener('click', () => {
            if (document.fullscreenEnabled) {
                qs('.main')?.requestFullscreen();
            } else if (doc.webkitFullscreenEnabled) {
                // @ts-ignore
                qs('.main')?.webkitRequestFullscreen();
            }
        });
    }

    await LocalesInit();
    {
        // These don't need Realms to be ready.
        const waitFor = [Account.init()];

        // Wait for Realms to get ready.
        await Realms.init();

        // These need Realms to be ready.
        waitFor.push(Categories.init(), ItemsInit());

        // Wait for all of those (besides Realms).
        await Promise.all(waitFor);
    }

    const filterButton = qs('.main .search-bar .filter');
    filterButton?.addEventListener('mouseup', (event) => {
        const div = filterButton.querySelector('div');
        if (!div || div.style.display === 'block') {
            return;
        }

        div.style.display = 'block';
        const outside = document.body;
        /**
         * Called on mouseup to close the filter tooltip.
         */
        const closeDiv = function (event: Event) {
            let target = event.target;
            while ((target instanceof Node) && target.parentNode) {
                if (target === div) {
                    return;
                }
                target = target.parentNode;
            }
            div.style.removeProperty('display');
            outside.removeEventListener('mouseup', closeDiv);
        }
        outside.addEventListener('mouseup', closeDiv);
        event.stopPropagation();
    });

    {
        const rarityClassFix = (select: HTMLSelectElement) =>
            select.querySelectorAll('option').forEach(option => {
                if (option.selected) {
                    select.classList.add(option.className);
                } else {
                    select.classList.remove(option.className);
                }
            });
        const rarityFrom = qs('.main .search-bar .filter select.rarity[name="rarity-from"]') as HTMLSelectElement|null;
        const rarityTo = qs('.main .search-bar .filter select.rarity[name="rarity-to"]') as HTMLSelectElement|null;
        if (rarityFrom && rarityTo) {
            rarityFrom.addEventListener('change', () => {
                rarityTo.selectedIndex = Math.max(rarityFrom.selectedIndex, rarityTo.selectedIndex);
                rarityClassFix(rarityFrom);
                rarityClassFix(rarityTo);
            });
            rarityTo.addEventListener('change', () => {
                rarityFrom.selectedIndex = Math.min(rarityFrom.selectedIndex, rarityTo.selectedIndex);
                rarityClassFix(rarityFrom);
                rarityClassFix(rarityTo);
            });
        }
    }

    qs('.main .bottom-bar .links a.home')?.addEventListener('click', event => {
        event.preventDefault();
        Detail.hide();
        Search.hide();
        welcome && (welcome.style.display = '');
    });

    setInterval(updateDeltaTimestamps, MS_MINUTE);

    Search.init();
    if (!(await Hash.init()) && Realms.getCurrentRealm()) {
        // Preload realm and region state if we can.
        Auctions.getRealmState();
        Auctions.getRegionState();
    }
}

init().catch(alert);

