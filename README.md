# Cartas — archivo privado

Aplicación web en español para guardar cartas escritas o archivos adjuntos. Las personas con cuenta pueden leer y descargar cartas; solo la cuenta administradora puede crear, editar o eliminar contenido. La autorización se aplica en Supabase con Row Level Security, no solo en la interfaz.

## Requisitos

- Node.js 20.19+ o 22.12+
- Un proyecto Supabase

## Configuración

1. Instala las dependencias con `npm install`.
2. En Supabase, abre **SQL Editor**, pega y ejecuta [`supabase/schema.sql`](./supabase/schema.sql).
3. Abre la aplicación y regístrate con el correo que usarás como administrador. Para darle el rol de administrador, copia su UID desde **Authentication → Users** y ejecuta esta consulta en **SQL Editor**, reemplazando el UID de ejemplo:

   ```sql
   UPDATE auth.users
   SET raw_app_meta_data =
     COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   WHERE id = 'PEGA-AQUI-EL-UID'::uuid
   RETURNING id, raw_app_meta_data;
   ```

   Verifica que el resultado contenga `"role": "admin"` y vuelve a iniciar sesión. No asignes este rol a las cuentas lectoras; las cuentas creadas desde el registro reciben solo permisos de lectura.
4. En Supabase, confirma que el registro por correo esté permitido en los ajustes de **Authentication** (opción **Allow new users to sign up**). Las personas pueden crear su propia cuenta desde **Regístrate** en la aplicación. Si la confirmación de correo está activada, deberán confirmar su dirección antes de iniciar sesión.
5. Copia `.env.example` a `.env` y completa la URL y la clave `anon`/publicable del proyecto (las encontrarás en **Project Settings → API**).
6. Ejecuta `npm run dev` y abre la dirección local que muestra Vite.

Para publicar la aplicación, compila con `npm run build` y despliega la carpeta `dist` en un servicio de hosting estático. Configura allí las mismas variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Los archivos se guardan en un bucket privado de Supabase, con un límite de 50 MB por archivo. Los enlaces de descarga expiran después de un minuto. No uses una clave `service_role` en el navegador.
