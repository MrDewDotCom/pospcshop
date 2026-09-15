import { useEffect, useReducer } from 'react';
import type { CartLine, ProductListItem } from '@pcshop/shared';

// The POS cart lives only in the browser (Q1: a cart never touches or reserves stock). It's kept in
// localStorage per user, so a refresh or an accidental tab close doesn't lose a half-rung-up bill.
// Prices shown here are a snapshot; checkout sends the total the cashier saw, and the server refuses
// with PRICE_CHANGED if a price moved in the meantime (P25), after which the cart is refreshed.

export interface CartSerial {
  id: number;
  serialNo: string;
}

export interface CartItem {
  product: ProductListItem;
  /** For serial products this always equals serials.length. */
  qty: number;
  serials: CartSerial[];
}

export interface CartCustomer {
  id: number;
  name: string;
  phone: string;
}

export interface CartState {
  items: CartItem[];
  customer: CartCustomer | null;
  note: string;
}

type Action =
  | { type: 'add'; product: ProductListItem; serial?: CartSerial }
  | { type: 'setQty'; productId: number; qty: number }
  | { type: 'setSerials'; productId: number; serials: CartSerial[] }
  | { type: 'remove'; productId: number }
  | { type: 'refreshProducts'; products: ProductListItem[] }
  | { type: 'setCustomer'; customer: CartCustomer | null }
  | { type: 'setNote'; note: string }
  | { type: 'clear' };

const EMPTY: CartState = { items: [], customer: null, note: '' };
export const MAX_QTY = 1000;

function reducer(state: CartState, action: Action): CartState {
  const update = (productId: number, fn: (item: CartItem) => CartItem | null) => ({
    ...state,
    items: state.items.flatMap((item) => {
      if (item.product.id !== productId) return [item];
      const next = fn(item);
      return next ? [next] : [];
    }),
  });

  switch (action.type) {
    case 'add': {
      const existing = state.items.find((i) => i.product.id === action.product.id);
      if (!existing) {
        const serials = action.serial ? [action.serial] : [];
        const item: CartItem = {
          product: action.product,
          qty: action.product.serialRequired ? serials.length : 1,
          serials,
        };
        return { ...state, items: [...state.items, item] };
      }
      return update(action.product.id, (item) => {
        if (!item.product.serialRequired) {
          return { ...item, product: action.product, qty: Math.min(MAX_QTY, item.qty + 1) };
        }
        const serial = action.serial;
        if (!serial || item.serials.some((s) => s.id === serial.id)) return item;
        const serials = [...item.serials, serial];
        return { ...item, product: action.product, serials, qty: serials.length };
      });
    }
    case 'setQty':
      return update(action.productId, (item) =>
        item.product.serialRequired
          ? item
          : { ...item, qty: Math.max(1, Math.min(MAX_QTY, Math.floor(action.qty) || 1)) },
      );
    case 'setSerials':
      return update(action.productId, (item) => ({
        ...item,
        serials: action.serials,
        qty: action.serials.length,
      }));
    case 'remove':
      return update(action.productId, () => null);
    case 'refreshProducts': {
      const byId = new Map(action.products.map((p) => [p.id, p]));
      return {
        ...state,
        items: state.items.map((item) => ({
          ...item,
          product: byId.get(item.product.id) ?? item.product,
        })),
      };
    }
    case 'setCustomer':
      return { ...state, customer: action.customer };
    case 'setNote':
      return { ...state, note: action.note };
    case 'clear':
      return EMPTY;
  }
}

const storageKey = (userId: number) => `pcshop.pos.cart.v1.${userId}`;

function load(userId: number): CartState {
  try {
    const text = localStorage.getItem(storageKey(userId));
    if (!text) return EMPTY;
    const parsed = JSON.parse(text) as Partial<CartState>;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      customer: parsed.customer ?? null,
      note: typeof parsed.note === 'string' ? parsed.note : '',
    };
  } catch {
    return EMPTY;
  }
}

export function usePosCart(userId: number) {
  const [state, dispatch] = useReducer(reducer, userId, load);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(state));
    } catch {
      // Storage full or blocked: the cart still works, it just won't survive a refresh.
    }
  }, [state, userId]);
  return [state, dispatch] as const;
}

/** Cart lines for the shared pricing math. Items without a price never get into the cart. */
export function toCartLines(items: CartItem[]): CartLine[] {
  return items
    .filter((item) => item.qty > 0)
    .map((item) => ({
      unitPriceSatang: item.product.priceSatang ?? 0,
      regularPriceSatang: item.product.regularPriceSatang,
      qty: item.qty,
    }));
}

/** Why an item can't be sold as it is (shown on the line; checkout stays disabled). */
export function itemProblem(item: CartItem, allowNegativeStock: boolean): string | null {
  const { product } = item;
  if (product.priceSatang === null) return 'ยังไม่ได้ตั้งราคา';
  if (product.serialRequired && item.serials.length === 0) return 'กรุณาเลือกซีเรียล';
  if (
    product.trackStock &&
    item.qty > product.onHand &&
    (product.serialRequired || !allowNegativeStock)
  ) {
    return `สต็อกไม่พอ (เหลือ ${product.onHand.toLocaleString('th-TH')})`;
  }
  return null;
}
