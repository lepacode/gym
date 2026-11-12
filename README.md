# Mis entrenamientos

App web para armar rutinas y registrar sesiones de gimnasio. HTML + CSS + JavaScript puro, sin dependencias ni build.

## Uso

Abrí `index.html` en el navegador (o servila con cualquier servidor estático).

- **Crear rutina**: nombre, ejercicios y series (solo repeticiones).
- **Ver**: previsualizá la rutina con sus series.
- **Entrenar**: marcá cada serie hecha con un toque; el cronómetro corre solo.
- **Guardar sesión**: la sesión queda en el **Historial** y actualiza la rutina con los valores usados.

## Datos

Todo se guarda en `localStorage` bajo la clave `gymapp.v1`, en el navegador de cada dispositivo:

```js
{ routines: [...], history: [...], active: null | { ... } }
```

- No hay servidor ni sincronización: los datos no pasan de un dispositivo a otro.
- Si limpiás los datos del navegador, se borran.

## Publicar en GitHub Pages

1. Subí `index.html`, `app.js` y `styles.css` a la raíz de un repositorio público.
2. **Settings → Pages → Source: Deploy from a branch**.
3. Branch `main`, carpeta `/ (root)` y **Save**.
4. La app queda en `https://TU-USUARIO.github.io/TU-REPO/`.
