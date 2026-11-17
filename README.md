# Cartas — archivo privado

Aplicación web en español para guardar cartas escritas o archivos adjuntos. Las personas con cuenta pueden leer y descargar cartas; solo la cuenta administradora puede crear, editar o eliminar contenido. La autorización se aplica en Supabase con Row Level Security, no solo en la interfaz.

## Requisitos

- Node.js 20.19+ o 22.12+
- Un proyecto Supabase

## Configuración

1. Instala las dependencias con `npm install`.
2. En Supabase, abre **SQL Editor**, pega y ejecuta [`supabase/schema.sql`](./supabase/schema.sql).
3. En Supabase, abre **Authentication → Sign In / Providers → Email** y desactiva **Confirm email**. Confirma también que **Allow new users to sign up** esté activado. El sistema usa nombres de usuario sin enviar correos; por eso la confirmación debe estar desactivada.
4. Abre la aplicación y regístrate con el nombre de usuario que usarás como administrador. Para asignarle el rol, reemplaza `miusuario` en esta consulta por tu nombre de usuario (en minúsculas) y ejecútala en **SQL Editor**:

   ```sql
   UPDATE auth.users
   SET raw_app_meta_data =
     COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   WHERE email = 'miusuario@users.carwed.invalid'
   RETURNING id, raw_app_meta_data;
   ```

   Verifica que el resultado contenga `"role": "admin"` y vuelve a iniciar sesión. Si ya tenías una cuenta administradora con correo, crea una cuenta nueva con nombre de usuario y asígnale el rol; después de comprobar el acceso puedes eliminar la cuenta antigua. No asignes el rol a las cuentas lectoras.
5. Copia `.env.example` a `.env` y completa la URL y la clave `anon`/publicable del proyecto (las encontrarás en **Project Settings → API**).
6. Ejecuta `npm run dev` y abre la dirección local que muestra Vite.

Supabase Auth no ofrece nombres de usuario directamente. La aplicación convierte cada nombre en un identificador interno con formato `usuario@users.carwed.invalid`; no es una dirección real ni se usa para enviar correos. Los nombres deben tener entre 3 y 24 letras, números, puntos, guiones o guiones bajos. No hay recuperación automática de contraseña; una persona administradora debe restablecerla desde Supabase.

## Publicar con GitHub Pages

El workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) compila y publica el sitio automáticamente cada vez que subes cambios a la rama `main`.

1. En VS Code, abre **Source Control** (icono de ramas a la izquierda). Pulsa **Initialize Repository**, escribe un mensaje como `Primera versión` y pulsa **Commit**.
2. Pulsa **Publish to GitHub** y elige crear un repositorio. Para publicar con GitHub Pages gratis, el repositorio debe ser público; un repositorio privado requiere un plan de GitHub que admita Pages. La página puede ser pública, pero las cartas siguen protegidas por el inicio de sesión y las políticas de Supabase. Confirma la publicación cuando VS Code lo pregunte.
3. En GitHub, abre el repositorio y ve a **Settings → Secrets and variables → Actions → New repository secret**. Crea estos dos secretos con los valores de **Supabase → Project Settings → API**:
   - `VITE_SUPABASE_URL`: la URL del proyecto.
   - `VITE_SUPABASE_ANON_KEY`: la clave publicable (`anon`/publishable), nunca la clave `service_role`.
4. En GitHub, ve a **Settings → Pages** y selecciona **GitHub Actions** como origen de publicación.
5. En VS Code, haz un cambio, escribe un mensaje en **Source Control** y pulsa **Commit**, luego **Sync Changes** (o **Push**). En GitHub, abre la pestaña **Actions** y espera a que **Build and deploy to GitHub Pages** termine correctamente.
6. La dirección del sitio aparece en **Settings → Pages** y en el resultado del workflow. En **Supabase → Authentication → URL Configuration**, configura **Site URL** con esa dirección.

El workflow construye el sitio con la ruta correcta para un repositorio de proyecto de GitHub Pages. No subas el archivo `.env`; los secretos de Actions se usan durante la compilación. Los archivos de cartas permanecen en el bucket privado de Supabase.

Los archivos se guardan en un bucket privado de Supabase, con un límite de 50 MB por archivo. Los enlaces de descarga expiran después de un minuto. No uses una clave `service_role` en el navegador.
