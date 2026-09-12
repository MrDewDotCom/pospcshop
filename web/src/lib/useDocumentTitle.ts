import { useEffect } from 'react';

export const APP_TITLE = 'PC Shop Manager';

/**
 * Sets the browser tab title. The shop usually has several tabs open on the counter PC (products,
 * receiving, stock lookup), so "สินค้า · PC Shop Manager" is much easier to pick out than one title
 * repeated everywhere. Pass undefined while the name is still loading to keep the plain app title.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_TITLE}` : APP_TITLE;
    return () => {
      document.title = APP_TITLE;
    };
  }, [title]);
}
