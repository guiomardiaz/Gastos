# Mis Gastos

App personal para controlar gastos en efectivo, con límites por categoría y avisos con tres tonos (suave, directo, sin filtro).

- PWA sin dependencias: HTML + CSS + JS.
- Los datos se guardan en el móvil (IndexedDB). No hay base de datos ni cuentas.
- Exportar/importar copia de seguridad en JSON desde Ajustes.

## Probar en local

```
npm start
```

y abre http://localhost:3000

## Desplegar en Railway

1. Sube esta carpeta a un repositorio de GitHub.
2. En Railway: New Project → Deploy from GitHub repo → elige el repo.
3. Railway detecta `package.json` y ejecuta `npm start`. Luego en Settings → Networking pulsa **Generate Domain**.
4. Abre esa URL en el móvil y usa "Añadir a pantalla de inicio" (Safari: Compartir; Chrome: menú ⋮ → Instalar app).

## Importante

Los datos viven en el navegador del dispositivo. Si borras los datos del sitio o cambias de móvil, se pierden: exporta una copia de vez en cuando.
