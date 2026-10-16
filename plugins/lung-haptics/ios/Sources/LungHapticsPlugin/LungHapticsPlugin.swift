import Foundation
import Capacitor
import CoreHaptics
import UIKit

/// Lung-like haptics for iOS using Core Haptics.
///
/// Each breathing phase becomes one continuous haptic event whose intensity
/// and sharpness follow the envelope sent from JS (points every ~40 ms),
/// plus an optional crisp transient at the start of the phase.
@objc(LungHapticsPlugin)
public class LungHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LungHapticsPlugin"
    public let jsName = "LungHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tap", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    // Core Haptics allows a limited number of control points per curve,
    // so long phases are split into consecutive curves.
    private static let pointsPerCurve = 16

    private var engine: CHHapticEngine?
    private var player: CHHapticAdvancedPatternPlayer?

    private var supportsHaptics: Bool {
        CHHapticEngine.capabilitiesForHardware().supportsHaptics
    }

    private func ensureEngine() throws -> CHHapticEngine {
        if let engine = engine { return engine }
        let e = try CHHapticEngine()
        e.playsHapticsOnly = true
        e.isAutoShutdownEnabled = true
        e.resetHandler = { [weak self] in
            try? self?.engine?.start()
        }
        e.stoppedHandler = { [weak self] _ in
            self?.player = nil
        }
        try e.start()
        engine = e
        return e
    }

    @objc func capabilities(_ call: CAPPluginCall) {
        call.resolve([
            "supported": supportsHaptics,
            "amplitude": supportsHaptics,
            "platform": "ios"
        ])
    }

    @objc func play(_ call: CAPPluginCall) {
        guard supportsHaptics else {
            call.resolve()
            return
        }
        let durationMs = call.getDouble("durationMs") ?? 0
        let withTransient = call.getBool("transient") ?? true
        let raw = call.getArray("points", JSObject.self) ?? []
        let points: [(t: Double, a: Float, s: Float)] = raw.compactMap { p in
            guard let t = (p["t"] as? NSNumber)?.doubleValue,
                  let a = (p["a"] as? NSNumber)?.doubleValue else { return nil }
            let s = (p["s"] as? NSNumber)?.doubleValue ?? 0.3
            return (t / 1000.0, Float(max(0, min(1, a))), Float(max(0, min(1, s))))
        }
        guard durationMs > 0, !points.isEmpty else {
            call.resolve()
            return
        }
        let duration = durationMs / 1000.0

        var events: [CHHapticEvent] = []
        if withTransient {
            events.append(CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.75),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.7)
                ],
                relativeTime: 0))
        }
        events.append(CHHapticEvent(
            eventType: .hapticContinuous,
            parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5)
            ],
            relativeTime: 0,
            duration: min(duration, 30)))

        // Intensity control multiplies the event intensity (0..1);
        // sharpness control is added to the event sharpness (-1..1).
        var curves: [CHHapticParameterCurve] = []
        var start = 0
        while start < points.count {
            let end = min(points.count, start + LungHapticsPlugin.pointsPerCurve)
            let chunk = Array(points[start..<end])
            let t0 = chunk[0].t
            curves.append(CHHapticParameterCurve(
                parameterID: .hapticIntensityControl,
                controlPoints: chunk.map { .init(relativeTime: $0.t - t0, value: $0.a) },
                relativeTime: t0))
            curves.append(CHHapticParameterCurve(
                parameterID: .hapticSharpnessControl,
                controlPoints: chunk.map { .init(relativeTime: $0.t - t0, value: $0.s - 0.5) },
                relativeTime: t0))
            // Overlap by one point so consecutive curves join without a step.
            start = end == points.count ? end : end - 1
        }

        DispatchQueue.main.async {
            do {
                try self.player?.stop(atTime: CHHapticTimeImmediate)
                let engine = try self.ensureEngine()
                let pattern = try CHHapticPattern(events: events, parameterCurves: curves)
                let player = try engine.makeAdvancedPlayer(with: pattern)
                self.player = player
                try player.start(atTime: CHHapticTimeImmediate)
                call.resolve()
            } catch {
                // Engine may have been reset (e.g. app went to background); retry once.
                self.engine = nil
                do {
                    let engine = try self.ensureEngine()
                    let pattern = try CHHapticPattern(events: events, parameterCurves: curves)
                    let player = try engine.makeAdvancedPlayer(with: pattern)
                    self.player = player
                    try player.start(atTime: CHHapticTimeImmediate)
                    call.resolve()
                } catch {
                    call.reject("haptics failed: \(error.localizedDescription)")
                }
            }
        }
    }

    @objc func tap(_ call: CAPPluginCall) {
        let strength = call.getString("strength") ?? "medium"
        DispatchQueue.main.async {
            let style: UIImpactFeedbackGenerator.FeedbackStyle = strength == "heavy" ? .heavy : .medium
            let gen = UIImpactFeedbackGenerator(style: style)
            gen.prepare()
            gen.impactOccurred()
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            try? self.player?.stop(atTime: CHHapticTimeImmediate)
            self.player = nil
            call.resolve()
        }
    }
}
