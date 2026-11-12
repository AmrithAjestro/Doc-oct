import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { assetUrl, unwrap } from '../lib/api';

const DEFAULTS = { appName: 'DocBook', tagline: 'Book trusted doctors in minutes', logoUrl: null, currency: 'INR', commissionType: 'percentage', commissionValue: 0 };

const BrandingContext = createContext({ ...DEFAULTS, refresh: () => {} });

/** App name, logo, currency and commission set by the admin; used everywhere the brand appears. */
export function BrandingProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);

  const refresh = useCallback(async () => {
    try {
      setSettings({ ...DEFAULTS, ...unwrap(await api.get('/settings/public')) });
    } catch {
      /* keep defaults; pages still work */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    document.title = settings.appName;
  }, [settings.appName]);

  const value = useMemo(() => ({ ...settings, logoSrc: assetUrl(settings.logoUrl), refresh }), [settings, refresh]);
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export const useBranding = () => useContext(BrandingContext);
