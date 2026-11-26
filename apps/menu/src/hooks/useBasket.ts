import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { BASKET_STORAGE_KEY, emptyBasket, parseStored, serializeStored, type StoredBasket } from '@/lib/orderLogic';

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The guest's order, kept on the phone so a refresh, an ended table session or a closed tab
 * does not lose it. It is read after the first render (the server renders it empty, so server
 * and client markup match) and written on every change. Without storage it still works, for
 * this visit only. One basket per phone: the table session id is the guest's secret and the
 * page never sees it, so it cannot name the basket.
 */
export function useBasket(): [StoredBasket, Dispatch<SetStateAction<StoredBasket>>] {
  const [basket, setBasket] = useState<StoredBasket>(emptyBasket);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setBasket(parseStored(store()?.getItem(BASKET_STORAGE_KEY) ?? null, Date.now()));
    } catch {
      /* blocked storage: start empty */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      store()?.setItem(BASKET_STORAGE_KEY, serializeStored(basket, Date.now()));
    } catch {
      /* private mode or a full disk: the order lives on in memory */
    }
  }, [basket, loaded]);

  return [basket, setBasket];
}
