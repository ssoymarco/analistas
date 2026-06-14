// ── TermsOfServiceBody ─────────────────────────────────────────────────────
// Mirror of the canonical terms of service at
// https://somosanalistas.com/terminos-y-condiciones/
//
// Companion to PrivacyPolicyBody — same primitives, same structure, same
// in-app/web sync contract. When the WordPress page is updated, update this
// file too (and vice versa).
// ────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text } from 'react-native';
import { useThemeColors } from '../theme/useTheme';

// ── Small presentational primitives (identical to PrivacyPolicyBody) ───────

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

export const TermsOfServiceBody: React.FC = () => {
  return (
    <>
      <Paragraph>
        <Bold>Analistas Oficial Medios Digitales SA de CV</Bold> ("Analistas", "nosotros") ofrece la aplicación móvil Analistas (la "App") y los sitios web somosanalistas.com y analistas.app (los "Sitios"). Al acceder o usar la App y los Sitios aceptas estos Términos y Condiciones (los "Términos") en su totalidad. Si no estás de acuerdo, no utilices el servicio.
      </Paragraph>

      <SectionTitle>Descripción del servicio</SectionTitle>
      <Paragraph>
        Analistas es una plataforma informativa de fútbol que ofrece resultados, calendarios, alineaciones, estadísticas, noticias y otras funciones relacionadas con clubes, ligas y selecciones. El contenido se proporciona con fines informativos y de entretenimiento. Analistas no es una casa de apuestas, ni un proveedor de transmisiones en vivo, ni un servicio de pronósticos garantizados.
      </Paragraph>

      <SectionTitle>Cuentas de usuario</SectionTitle>
      <Bullet>Puedes usar la App de forma anónima o crear una cuenta con Apple Sign In o Google Sign In.</Bullet>
      <Bullet>Debes tener al menos <Bold>13 años</Bold> para crear una cuenta. Si tienes entre 13 y 18 años, debes contar con autorización de tu padre, madre o tutor.</Bullet>
      <Bullet>Eres responsable de mantener la confidencialidad de las credenciales asociadas a tu cuenta y de toda la actividad que ocurra bajo ella.</Bullet>
      <Bullet>Debes proporcionar información veraz al registrarte y mantenerla actualizada.</Bullet>

      <SectionTitle>Uso permitido</SectionTitle>
      <Paragraph>Puedes usar Analistas para informarte sobre el deporte, seguir a tus equipos y jugadores, recibir notificaciones y compartir contenido dentro de los canales que la App ofrece.</Paragraph>

      <SectionTitle>Uso prohibido</SectionTitle>
      <Paragraph>Te comprometes a no:</Paragraph>
      <Bullet>Usar la App para fines ilegales o que violen estos Términos.</Bullet>
      <Bullet>Intentar acceder sin autorización a cuentas, servidores o redes asociados al servicio.</Bullet>
      <Bullet>Realizar ingeniería inversa, descompilar, copiar o crear obras derivadas de la App.</Bullet>
      <Bullet>Recolectar datos de otros usuarios mediante scraping, bots o medios automatizados.</Bullet>
      <Bullet>Suplantar la identidad de otra persona u organización.</Bullet>
      <Bullet>Interferir con el funcionamiento normal del servicio (ataques, sobrecarga, distribución de malware).</Bullet>
      <Bullet>Reproducir o redistribuir el contenido de Analistas sin autorización por escrito.</Bullet>

      <SectionTitle>Suscripciones (Titular)</SectionTitle>
      <Bullet>"Titular" es la suscripción premium de Analistas que desbloquea funciones adicionales. Los precios y beneficios se muestran dentro de la App antes de la compra.</Bullet>
      <Bullet>La suscripción se cobra a través de la App Store de Apple o Google Play, según tu dispositivo, y se <Bold>renueva automáticamente</Bold> al final de cada periodo de facturación salvo que la canceles con al menos 24 horas de anticipación.</Bullet>
      <Bullet>Puedes cancelar en cualquier momento desde los ajustes de tu cuenta de Apple o Google. La cancelación tendrá efecto al final del periodo en curso.</Bullet>
      <Bullet>Los reembolsos se procesan según las políticas de Apple y Google. Analistas no procesa reembolsos directamente.</Bullet>
      <Bullet>Podemos modificar los precios o beneficios de Titular en el futuro. Cualquier cambio se comunicará con al menos 30 días de anticipación.</Bullet>

      <SectionTitle>Contenido de terceros</SectionTitle>
      <Paragraph>
        La App muestra logos, escudos, nombres de equipos, ligas, jugadores y resultados deportivos cuya propiedad pertenece a sus respectivos dueños. Estos elementos se utilizan exclusivamente con fines informativos y editoriales. Las noticias provienen de fuentes externas y de nuestro propio equipo editorial; los enlaces a sitios de terceros se ofrecen como cortesía y no implican respaldo.
      </Paragraph>

      <SectionTitle>Propiedad intelectual</SectionTitle>
      <Paragraph>
        Todo el código, diseño, gráficos, textos, marcas e interfaz de Analistas son propiedad de Analistas Oficial Medios Digitales SA de CV o de sus licenciantes, y están protegidos por las leyes mexicanas e internacionales de propiedad intelectual. Te otorgamos una licencia limitada, no exclusiva, no transferible y revocable para usar la App únicamente conforme a estos Términos.
      </Paragraph>

      <SectionTitle>Disclaimers y limitación de responsabilidad</SectionTitle>
      <Paragraph>
        El servicio se ofrece "tal cual" y "según disponibilidad". Analistas no garantiza que el contenido sea exacto, completo o esté libre de errores en todo momento. Las estadísticas y resultados pueden tener retrasos o inexactitudes.
      </Paragraph>
      <Paragraph>
        En la máxima medida permitida por la ley, Analistas no será responsable por daños indirectos, incidentales, especiales, consecuentes o punitivos derivados del uso del servicio, incluyendo pérdidas por decisiones tomadas con base en información proporcionada por la App.
      </Paragraph>

      <SectionTitle>Indemnización</SectionTitle>
      <Paragraph>
        Aceptas indemnizar y mantener libre de responsabilidad a Analistas y su equipo frente a cualquier reclamación, daño o gasto derivado de tu uso indebido del servicio, de tu incumplimiento de estos Términos o de la violación de derechos de terceros.
      </Paragraph>

      <SectionTitle>Terminación</SectionTitle>
      <Paragraph>
        Podemos suspender o terminar tu acceso a la App si incumples estos Términos, si tu actividad pone en riesgo a otros usuarios o al servicio, o si lo exige una autoridad competente. Tú puedes terminar tu cuenta en cualquier momento desde Perfil → Cerrar sesión → Eliminar cuenta.
      </Paragraph>

      <SectionTitle>Modificaciones a estos Términos</SectionTitle>
      <Paragraph>
        Podemos actualizar estos Términos ocasionalmente. Te notificaremos sobre cambios significativos dentro de la App o por correo electrónico (si te registraste para recibir comunicaciones). El uso continuado de la App tras los cambios implica la aceptación de los Términos actualizados.
      </Paragraph>

      <SectionTitle>Privacidad</SectionTitle>
      <Paragraph>
        El tratamiento de tus datos personales se rige por nuestra Política de Privacidad, disponible en somosanalistas.com/politica-privacidad/ y dentro de la App en Perfil → Política de privacidad.
      </Paragraph>

      <SectionTitle>Contacto</SectionTitle>
      <Paragraph>
        Para cualquier pregunta sobre estos Términos, contáctanos en:
      </Paragraph>
      <Paragraph>
        <Bold>Analistas Oficial Medios Digitales SA de CV</Bold>{'\n'}
        Correo: legal@somosanalistas.com{'\n'}
        Sitio: somosanalistas.com
      </Paragraph>

      <SectionTitle>Ley aplicable y jurisdicción</SectionTitle>
      <Paragraph>
        Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia derivada de su interpretación o cumplimiento será resuelta ante los tribunales competentes de la Ciudad de México, renunciando a cualquier otra jurisdicción que pudiera corresponderles por razón de domicilio presente o futuro.
      </Paragraph>
    </>
  );
};
