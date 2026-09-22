import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Button } from "@/ui/components";
import { colors, spacing } from "@/ui/theme";

/**
 * Camera barcode scanner (web/PWA). Uses html5-qrcode (ZXing) which works on
 * iOS Safari 15.1+ and Android browsers via getUserMedia — no native build
 * needed. On native, this falls back to a message (expo-camera would be used
 * in a native build instead).
 *
 * Renders a live camera viewfinder; calls onScan with the decoded barcode.
 */
export function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (barcode: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const regionId = useRef(`scanner-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef<any>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "web") {
      setSupported(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
          "html5-qrcode"
        );
        if (cancelled) return;

        const scanner = new Html5Qrcode(regionId.current, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decodedText: string) => {
            if (startedRef.current) return;
            startedRef.current = true;
            scanner.stop().catch(() => {});
            onScan(decodedText);
          },
          () => {}, // per-frame errors are normal while aiming
        );
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Camera unavailable. Check permissions and that you're on HTTPS.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      scannerRef.current?.stop().catch(() => {});
      scannerRef.current?.clear?.().catch(() => {});
    };
  }, [onScan]);

  if (!supported) {
    return (
      <View style={styles.box}>
        <Text style={styles.dim}>
          Camera scanning needs the web app. On your phone, open the app URL in
          Safari and allow camera access.
        </Text>
        <Button title="Close" variant="ghost" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Point at the barcode</Text>
      <View nativeID={regionId.current} id={regionId.current} style={styles.viewfinder} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Cancel" variant="ghost" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.md },
  title: { color: colors.text, fontSize: 15, fontWeight: "600" },
  viewfinder: {
    width: "100%",
    minHeight: 240,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13 },
});
