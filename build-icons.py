#!/usr/bin/env python3
"""
Genera los iconos PNG de la app a partir del escudo del Rugby Club Cornellà.

Identidad real del club: negro con borde naranja, escudo con franjas
rojigualdas y balón, y el lema "des de 1931".

Salidas:
  icon-192.png, icon-512.png   icono normal (con su marco)
  icon-maskable-512.png        versión con zona segura para Android
  icon-1024.png                para tiendas
  apple-touch-icon.png         iOS (180x180, sin transparencia)
  favicon.png                  pestaña del navegador
"""
import cairosvg, os

NEGRO   = '#121212'
NARANJA = '#E8590C'
ROJO    = '#C8102E'
AMARILLO= '#FFD100'

def escudo(cx, cy, escala, con_lema=True):
    """Escudo centrado en cx,cy. Dibujado sobre una rejilla base de 64."""
    e = escala
    def X(v): return cx + (v - 32) * e
    def Y(v): return cy + (v - 32) * e
    forma = (f"M {X(32)} {Y(11)} L {X(51)} {Y(18.5)} "
             f"L {X(51)} {Y(34)} "
             f"C {X(51)} {Y(45)} {X(42)} {Y(51.5)} {X(32)} {Y(55)} "
             f"C {X(22)} {Y(51.5)} {X(13)} {Y(45)} {X(13)} {Y(34)} "
             f"L {X(13)} {Y(18.5)} Z")
    # rojigualda: fondo amarillo con franjas rojas verticales
    franjas = (f'<rect x="{X(13)}" y="{Y(11)}" width="{38*e}" height="{46*e}" '
               f'fill="{AMARILLO}"/>')
    for i in range(5):
        fx = 13.8 + i * 7.6
        franjas += (f'<rect x="{X(fx)}" y="{Y(11)}" width="{3.8*e}" '
                    f'height="{46*e}" fill="{ROJO}"/>')
    lema = ''
    if con_lema:
        lema = (f'<text x="{cx}" y="{Y(62.5)}" font-family="Helvetica,Arial,sans-serif" '
                f'font-size="{5.2*e}" font-weight="700" fill="{NARANJA}" '
                f'text-anchor="middle" letter-spacing="{1.1*e}">DES DE 1931</text>')
    return f'''
    <path id="sh" d="{forma}" fill="#FFFFFF"/>
    <clipPath id="cl"><use href="#sh"/></clipPath>
    <g clip-path="url(#cl)">
      {franjas}
    </g>
    <path d="{forma}" fill="none" stroke="{NEGRO}" stroke-width="{2.4*e}"/>
    <ellipse cx="{cx}" cy="{Y(32)}" rx="{10*e}" ry="{6*e}"
             transform="rotate(-38 {cx} {Y(32)})"
             fill="{NARANJA}" stroke="{NEGRO}" stroke-width="{2.1*e}"/>
    <g stroke="#FFFFFF" stroke-width="{1.6*e}" stroke-linecap="round">
      <path d="M {X(28.4)} {Y(35.6)} L {X(35.6)} {Y(28.4)}"/>
      <path d="M {X(30.1)} {Y(31.6)} L {X(31.7)} {Y(33.2)}"/>
      <path d="M {X(32.5)} {Y(29.2)} L {X(34.1)} {Y(30.8)}"/>
    </g>
    {lema}'''

def icono(size, maskable=False, marco=True, fondo=NEGRO, lema=True):
    """maskable: el contenido se encoge al 62% para la zona segura de Android.
    En el maskable el lema va sin dibujar: el texto de "DES DE 1931" ensancha
    el contenido y el escudo se recortaba al enmascarar en circulo."""
    if maskable:
        escala = size / 64 * 0.62
        # La forma del escudo esta centrada en la unidad 33 de la rejilla (no
        # en la 32): escudo() la coloca a cy + escala, asi que pasando
        # cy = mitad - escala el escudo queda EXACTAMENTE en el centro.
        cy = size * 0.5 - escala
        borde = ''
        radio = 0
    else:
        escala = size / 64 * 0.80
        cy = size * 0.47
        r = size * 0.22
        borde = (f'<rect x="{size*0.03}" y="{size*0.03}" '
                 f'width="{size*0.94}" height="{size*0.94}" rx="{r}" '
                 f'fill="none" stroke="{NARANJA}" stroke-width="{size*0.042}"/>'
                 if marco else '')
        radio = r
    fondo_el = (f'<rect width="{size}" height="{size}" fill="{fondo}"/>' if maskable
                else f'<rect width="{size}" height="{size}" rx="{radio}" fill="{fondo}"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="{size}" height="{size}" viewBox="0 0 {size} {size}">
  {fondo_el}
  {borde}
  {escudo(size/2, cy, escala, con_lema=(lema and size >= 180))}
</svg>'''

def guardar(nombre, svg, size):
    cairosvg.svg2png(bytestring=svg.encode('utf-8'),
                     write_to=nombre, output_width=size, output_height=size)
    print(f'  {nombre}  {size}x{size}  {os.path.getsize(nombre)//1024} KB')

print('Generando iconos del Rugby Club Cornellà')
guardar('icon-192.png',           icono(192),                192)
guardar('icon-512.png',           icono(512),                512)
guardar('icon-maskable-512.png',  icono(512, maskable=True, lema=False), 512)
guardar('icon-1024.png',          icono(1024),               1024)
guardar('apple-touch-icon.png',   icono(180),                180)
guardar('favicon.png',            icono(64,  marco=False),   64)
print('Listo.')
