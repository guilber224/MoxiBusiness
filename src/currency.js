import { n } from "./utils/businessLogic.js";

export const CURRENCIES = [
  { code:"BOB", symbol:"Bs.",  name:"Boliviano",        locale:"es-BO" },
  { code:"USD", symbol:"$",    name:"Dólar Americano",  locale:"en-US" },
  { code:"CLP", symbol:"CLP$", name:"Peso Chileno",     locale:"es-CL" },
  { code:"ARS", symbol:"ARS$", name:"Peso Argentino",   locale:"es-AR" },
  { code:"BRL", symbol:"R$",   name:"Real Brasileño",   locale:"pt-BR" },
  { code:"EUR", symbol:"€",    name:"Euro",             locale:"es-ES" },
  { code:"CNY", symbol:"¥",    name:"Yuan Chino",       locale:"zh-CN" },
  { code:"PEN", symbol:"S/",   name:"Sol Peruano",      locale:"es-PE" },
  { code:"MXN", symbol:"MX$",  name:"Peso Mexicano",    locale:"es-MX" },
  { code:"PYG", symbol:"₲",    name:"Guaraní",          locale:"es-PY" },
];

// Moneda activa del proceso — se actualiza cuando cambia la config de la empresa.
let _currencySymbol = "Bs.";
let _currencyLocale = "es-BO";

export const getCurrencySymbol = () => _currencySymbol;
export const getCurrencyLocale = () => _currencyLocale;

// Aplica el código de moneda (o restablece a Bs./es-BO si no se reconoce).
export const applyCurrencyCode = (code) => {
  const cur = CURRENCIES.find(c => c.code === code);
  _currencySymbol = cur?.symbol ?? "Bs.";
  _currencyLocale = cur?.locale ?? "es-BO";
  return cur;
};

export const resetCurrency = () => {
  _currencySymbol = "Bs.";
  _currencyLocale = "es-BO";
};

export const formatCurrency = v => `${_currencySymbol} ${n(v).toLocaleString(_currencyLocale,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const Bs = formatCurrency;
