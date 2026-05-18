// ── PrivacyPolicyBody ──────────────────────────────────────────────────────
// Mirror of the canonical privacy policy at
// https://somosanalistas.com/politica-privacidad/
//
// When you update one, update the other. The in-app text is the offline
// fallback shown to App Store / Google Play reviewers; the website is the
// public-facing source of truth. Apple/Google require both to be consistent.
//
// To keep the markup readable, the body is composed from a handful of small
// presentational primitives (`Paragraph`, `SectionTitle`, `SubsectionTitle`,
// `Bullet`) that wrap typography choices in one place. If we ever want to
// tweak the legal text styling globally, this is the file.
// ────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text } from 'react-native';
import { useThemeColors } from '../theme/useTheme';

// ── Small presentational primitives ────────────────────────────────────────

const Paragraph: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const c = useThemeColors();
  return (
    <Text style={{ fontSize: 13, color: c.textSecondary, lineHeight: 20, marginBottom: 12 }}>
      {children}
    </Text>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const c = useThemeColors();
  return (
    <Text style={{ fontSize: 13, fontWeight: '800', color: c.textPrimary, marginTop: 18, marginBottom: 10, letterSpacing: 0.6, textTransform: 'uppercase' }}>
      {children}
    </Text>
  );
};

const SubsectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const c = useThemeColors();
  return (
    <Text style={{ fontSize: 13, fontWeight: '700', color: c.textPrimary, marginTop: 6, marginBottom: 6 }}>
      {children}
    </Text>
  );
};

const Bullet: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const c = useThemeColors();
  return (
    <View style={{ flexDirection: 'row', marginBottom: 8, paddingLeft: 4 }}>
      <Text style={{ fontSize: 13, color: c.textSecondary, marginRight: 8, lineHeight: 20 }}>•</Text>
      <Text style={{ fontSize: 13, color: c.textSecondary, lineHeight: 20, flex: 1 }}>{children}</Text>
    </View>
  );
};

const Bold: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const c = useThemeColors();
  return <Text style={{ fontWeight: '700', color: c.textPrimary }}>{children}</Text>;
};

// ── Body ───────────────────────────────────────────────────────────────────

export const PrivacyPolicyBody: React.FC = () => {
  return (
    <>
      <Paragraph>
        <Bold>Analistas Oficial Medios Digitales SA de CV</Bold> ("Analistas", "nosotros") opera la aplicación móvil Analistas (la "App") y los sitios web somosanalistas.com y analistas.app (los "Sitios"). Esta política informa sobre nuestras prácticas respecto a la recopilación, uso y protección de tus datos personales.
      </Paragraph>

      <SectionTitle>Información que recopilamos</SectionTitle>

      <SubsectionTitle>En la App:</SubsectionTitle>
      <Bullet><Bold>Información de cuenta:</Bold> Al registrarte con Apple Sign In o Google Sign In, recopilamos tu nombre, correo electrónico e identificador único de usuario. Si usas la app de forma anónima, no recopilamos datos personales identificables.</Bullet>
      <Bullet><Bold>Preferencias:</Bold> Equipos, jugadores y ligas favoritos, preferencias de notificaciones, idioma y zona horaria.</Bullet>
      <Bullet><Bold>Token de notificaciones:</Bold> Si otorgas permiso, recopilamos tu token de dispositivo para enviarte alertas de partidos (goles, resultados, alineaciones). Puedes desactivarlo en cualquier momento desde la App o los ajustes de tu dispositivo.</Bullet>
      <Bullet><Bold>Datos de errores:</Bold> Reportes anónimos de errores técnicos (sin datos personales identificables) a través de Sentry.</Bullet>

      <SubsectionTitle>En los Sitios web:</SubsectionTitle>
      <Bullet><Bold>Registro de interés:</Bold> En analistas.app recopilamos tu correo electrónico si te registras para recibir novedades sobre la App.</Bullet>
      <Bullet><Bold>Cookies:</Bold> Los Sitios pueden usar cookies de sesión y analíticas básicas para mejorar la experiencia de navegación.</Bullet>

      <SectionTitle>Cómo usamos tu información</SectionTitle>
      <Bullet>Para crear y gestionar tu cuenta en la App</Bullet>
      <Bullet>Para personalizar el contenido según tus preferencias deportivas</Bullet>
      <Bullet>Para enviarte notificaciones de los partidos que elegiste seguir</Bullet>
      <Bullet>Para enviarte comunicaciones sobre novedades de la App (solo si te registraste en analistas.app)</Bullet>
      <Bullet>Para detectar y corregir errores técnicos</Bullet>
      <Bullet>Para mejorar la experiencia general de la App y los Sitios</Bullet>
      <Paragraph>
        <Bold>NO</Bold> vendemos, alquilamos ni compartimos tu información personal con terceros con fines publicitarios.
      </Paragraph>

      <SectionTitle>Proveedores de servicios terceros</SectionTitle>
      <Bullet><Bold>Firebase (Google LLC):</Bold> autenticación y base de datos — firebase.google.com/support/privacy</Bullet>
      <Bullet><Bold>Sentry:</Bold> reporte anónimo de errores — sentry.io/privacy/</Bullet>
      <Bullet><Bold>Expo (Expo Inc.):</Bold> envío de notificaciones push — expo.dev/privacy</Bullet>
      <Bullet><Bold>Cloudflare:</Bold> infraestructura y seguridad — cloudflare.com/privacypolicy/</Bullet>

      <SectionTitle>Retención de datos</SectionTitle>
      <Paragraph>
        Conservamos tus datos mientras tu cuenta esté activa. Al eliminar tu cuenta, eliminamos tus datos personales en un plazo máximo de 30 días.
      </Paragraph>

      <SectionTitle>Privacidad de menores</SectionTitle>
      <Paragraph>
        Nuestros servicios no están dirigidos a menores de 13 años. No recopilamos a sabiendas información personal de menores de 13. Si nos enteramos de que hemos recopilado datos de un menor de 13 sin consentimiento parental verificable, los eliminaremos de inmediato. Si crees que un menor nos ha proporcionado datos, contáctanos en privacidad@somosanalistas.com.
      </Paragraph>

      <SectionTitle>Tus derechos</SectionTitle>
      <Paragraph>Puedes en cualquier momento:</Paragraph>
      <Bullet>Acceder a tus datos personales desde la sección Perfil de la App</Bullet>
      <Bullet>Corregir o actualizar tu información</Bullet>
      <Bullet>Eliminar tu cuenta y todos tus datos asociados desde Perfil → Cerrar sesión → Eliminar cuenta</Bullet>
      <Bullet>Solicitar una copia de tus datos contactándonos a privacidad@somosanalistas.com</Bullet>
      <Bullet>Oponerte al tratamiento de tus datos o retirar tu consentimiento</Bullet>
      <Paragraph>
        Atendemos estas solicitudes en un plazo máximo de 30 días.
      </Paragraph>

      <SectionTitle>Contacto</SectionTitle>
      <Paragraph>
        Para cualquier pregunta sobre esta política de privacidad o el ejercicio de tus derechos, contáctanos en:
      </Paragraph>
      <Paragraph>
        <Bold>Analistas Oficial Medios Digitales SA de CV</Bold>{'\n'}
        Correo: privacidad@somosanalistas.com{'\n'}
        Sitio: somosanalistas.com
      </Paragraph>

      <SectionTitle>Cambios a esta política</SectionTitle>
      <Paragraph>
        Podemos actualizar esta política ocasionalmente. Te notificaremos sobre cambios significativos dentro de la App o por correo electrónico (si te registraste). El uso continuado de la App tras los cambios implica la aceptación de la política actualizada.
      </Paragraph>

      <SectionTitle>Ley aplicable</SectionTitle>
      <Paragraph>
        Esta política se rige por las leyes de los Estados Unidos Mexicanos. Cualquier controversia será resuelta ante los tribunales competentes de la Ciudad de México.
      </Paragraph>
    </>
  );
};
