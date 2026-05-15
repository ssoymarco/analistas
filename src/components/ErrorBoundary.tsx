/**
 * ErrorBoundary
 *
 * Catches unhandled JS render errors so the whole app doesn't go blank.
 * Reports the error to Sentry automatically.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <YourScreen />
 *   </ErrorBoundary>
 *
 * The fallback UI is a clean full-screen message with a "Reintentar" button
 * that resets the boundary and lets the user try again without restarting.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Sentry from '@sentry/react-native';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  children: React.ReactNode;
  /** Optional custom fallback. Receives reset() so you can add a retry button. */
  fallback?: (reset: () => void) => React.ReactNode;
}

interface State {
  hasError: boolean;
  eventId: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, eventId: null };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Report to Sentry with the component stack as extra context.
    const eventId = Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
    this.setState({ eventId: eventId ?? null });

    if (__DEV__) {
      console.error('[ErrorBoundary] Uncaught render error:', error);
      console.error('[ErrorBoundary] Component stack:', info.componentStack);
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, eventId: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(this.reset);
    }

    return <DefaultFallback onReset={this.reset} eventId={this.state.eventId} />;
  }
}

// ── Default fallback UI ────────────────────────────────────────────────────────

function DefaultFallback({
  onReset,
  eventId,
}: {
  onReset: () => void;
  eventId: string | null;
}) {
  return (
    <View style={s.container}>
      {/* Icon: broken shield */}
      <View style={s.iconWrap}>
        <View style={s.iconOuter}>
          <View style={s.iconInner} />
        </View>
        <View style={s.iconCrack} />
      </View>

      <Text style={s.title}>Algo salió mal</Text>
      <Text style={s.subtitle}>
        La pantalla tuvo un problema inesperado.{'\n'}
        Ya lo registramos y lo vamos a resolver.
      </Text>

      {eventId && (
        <Text style={s.eventId} selectable>
          ID: {eventId.slice(0, 8)}
        </Text>
      )}

      <TouchableOpacity style={s.btn} onPress={onReset} activeOpacity={0.8}>
        <Text style={s.btnText}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  iconWrap: {
    width: 64,
    height: 64,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOuter: {
    width: 48,
    height: 52,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: 'rgba(255,69,58,0.60)',
    backgroundColor: 'rgba(255,69,58,0.10)',
  },
  iconInner: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,69,58,0.50)',
  },
  iconCrack: {
    position: 'absolute',
    width: 2,
    height: 28,
    backgroundColor: 'rgba(255,69,58,0.70)',
    transform: [{ rotate: '15deg' }],
    top: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.50)',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
  },
  eventId: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    fontFamily: 'monospace',
    marginTop: 4,
  },
  btn: {
    marginTop: 20,
    backgroundColor: '#00E096',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnText: {
    color: '#0D0D0D',
    fontWeight: '700',
    fontSize: 15,
  },
});
