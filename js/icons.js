/* ============================================================================
   Iconografía SVG
   ----------------------------------------------------------------------------
   Los emoji como iconos de interfaz son una de las señales más reconocibles
   de una app generada sin criterio: no escalan, cambian según el sistema
   operativo y rompen la coherencia visual. Aquí no se usa ninguno.
   Trazo uniforme de 1.75, esquinas redondeadas, rejilla de 24.
   ============================================================================ */

function ico(path, size = 20, sw = 1.75){
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="${sw}" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const I = {
  home:      s => ico('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/>', s),
  calendar:  s => ico('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', s),
  squad:     s => ico('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.8c1.8.7 3 2.4 3 4.4"/>', s),
  clipboard: s => ico('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h4"/>', s),
  dots:      s => ico('<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>', s),
  star:      (s,f)=> `<svg width="${s||20}" height="${s||20}" viewBox="0 0 24 24"
      fill="${f?'currentColor':'none'}" stroke="currentColor" stroke-width="1.6"
      stroke-linejoin="round" aria-hidden="true"><path d="m12 3.6 2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 17l-5.25 2.76 1-5.86L3.5 9.76l5.9-.86z"/></svg>`,
  user:      s => ico('<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>', s),
  users:     s => ico('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.8c1.8.7 3 2.4 3 4.4"/>', s),
  whistle:   s => ico('<path d="M14 7h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-6"/><circle cx="8.5" cy="13.5" r="5.5"/><circle cx="8.5" cy="13.5" r="1.6"/>', s),
  shield:    s => ico('<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/>', s),
  euro:      s => ico('<path d="M17.5 6.5A6.5 6.5 0 0 0 7 11.5v1a6.5 6.5 0 0 0 10.5 5"/><path d="M4.5 11h8M4.5 14h8"/>', s),
  chart:     s => ico('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', s),
  bell:      s => ico('<path d="M18 9a6 6 0 0 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>', s),
  check:     s => ico('<path d="m5 12.5 4.5 4.5L19 7"/>', s, 2.4),
  cross:     s => ico('<path d="M6 6l12 12M18 6 6 18"/>', s, 2.2),
  question:  s => ico('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.7.6-.7 1.1v.5"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>', s),
  clock:     s => ico('<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/>', s),
  doc:       s => ico('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>', s),
  plus:      s => ico('<path d="M12 5v14M5 12h14"/>', s, 2.1),
  chevron:   s => ico('<path d="m9 5 7 7-7 7"/>', s, 2),
  chevL:     s => ico('<path d="m15 5-7 7 7 7"/>', s, 2),
  arrow:     s => ico('<path d="M4 12h15M13 6l6 6-6 6"/>', s),
  pin:       s => ico('<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>', s),
  ball:      s => ico('<ellipse cx="12" cy="12" rx="9" ry="5.6" transform="rotate(-38 12 12)"/><path d="m9 15 6-6M10.6 11.2l1.6 1.6M12.4 9.4 14 11"/>', s),
  dumbbell:  s => ico('<path d="M6.5 7.5v9M4 9.5v5M17.5 7.5v9M20 9.5v5M6.5 12h11"/>', s),
  trophy:    s => ico('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5v1A3.5 3.5 0 0 0 7 10.3M17 6h2.5v1a3.5 3.5 0 0 1-2.5 3.3"/><path d="M12 14v3M9 20h6M10 17h4"/>', s),
  megaphone: s => ico('<path d="M4 10v4a1 1 0 0 0 1 1h3l8 4V5L8 9H5a1 1 0 0 0-1 1z"/><path d="M19 9.5a3.5 3.5 0 0 1 0 5"/>', s),
  logout:    s => ico('<path d="M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8"/><path d="M17 8.5 20.5 12 17 15.5M20 12h-9"/>', s),
  swap:      s => ico('<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>', s),
  search:    s => ico('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>', s),
  trash:     s => ico('<path d="M4 7h16M9 7V5h6v2M6.5 7l.8 12.1a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9L17.5 7"/>', s),
  bandage:   s => ico('<rect x="2.6" y="8.6" width="18.8" height="6.8" rx="3.4" transform="rotate(-45 12 12)"/><path d="M10 10l4 4"/>', s),
  target:    s => ico('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>', s),
  eye:       s => ico('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>', s),
  eyeOff:    s => ico('<path d="M10.6 6.2A9 9 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.5M6.6 7.6C3.9 9.2 2 12 2 12s4 6 10 6a9.6 9.6 0 0 0 4-.85"/><path d="M4 4l16 16"/><path d="M9.9 10a2.8 2.8 0 0 0 3.9 3.9"/>', s),
  lock:      s => ico('<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/>', s),
  mail:      s => ico('<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.6 7 8.4 6 8.4-6"/>', s),
  key:       s => ico('<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17.5 12v3M20.5 12v2"/>', s),
  copy:      s => ico('<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 5.5h-9a2 2 0 0 0-2 2v9"/>', s),
  info:      s => ico('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".95" fill="currentColor" stroke="none"/>', s),
  warn:      s => ico('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4"/><circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>', s),
  upload:    s => ico('<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>', s),
  download:  s => ico('<path d="M12 4v12M7.5 11.5 12 16l4.5-4.5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>', s),
  settings:  s => ico('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/>', s),
  sparkle:   s => ico('<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z"/>', s)
};

/** Escudo del club: triángulo con franjas rojigualdas y balón, sobre negro. */
function crest(size = 40){
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-label="Escudo del Rugby Club Cornellà">
    <rect x="1.5" y="1.5" width="61" height="61" rx="9" fill="#121212"
          stroke="#E8590C" stroke-width="3"/>
    <path id="cshape" d="M32 13 50 20v14c0 10-8 15.6-18 18.6C22 49.6 14 44 14 34V20z"
          fill="#FFFFFF"/>
    <clipPath id="cclip"><use href="#cshape"/></clipPath>
    <g clip-path="url(#cclip)">
      <rect x="14" y="13" width="4.5" height="42" fill="#C8102E"/>
      <rect x="23" y="13" width="4.5" height="42" fill="#C8102E"/>
      <rect x="32" y="13" width="4.5" height="42" fill="#C8102E"/>
      <rect x="41" y="13" width="4.5" height="42" fill="#C8102E"/>
      <rect x="14" y="13" width="36" height="42" fill="#FFD100" opacity=".55"
            style="mix-blend-mode:multiply"/>
    </g>
    <path d="M32 13 50 20v14c0 10-8 15.6-18 18.6C22 49.6 14 44 14 34V20z"
          fill="none" stroke="#121212" stroke-width="2.2"/>
    <ellipse cx="32" cy="32" rx="11" ry="6.6" transform="rotate(-38 32 32)"
             fill="#E8590C" stroke="#121212" stroke-width="2"/>
    <path d="M28 36l8-8M29.8 31.4l1.8 1.8M32.4 28.8l1.8 1.8" stroke="#FFFFFF"
          stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}
