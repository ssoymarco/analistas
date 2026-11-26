// Test stand-in for the app's i18n: resolves keys against the Spanish strings.
import es from '../../../src/i18n/locales/es';

function resolve(key: string): unknown {
  return key.split('.').reduce<any>((o, k) => (o && typeof o === 'object' ? o[k] : undefined), es);
}

const i18n = {
  language: 'es',
  t: (k: string, o?: any) => {
    const v = resolve(k);
    if (typeof v === 'string') return v.replace(/\{\{(\w+)\}\}/g, (_, name) => String(o?.[name] ?? ''));
    if (v !== undefined && o?.returnObjects) return v;
    return o && 'defaultValue' in o ? o.defaultValue : k;
  },
};
export default i18n;
