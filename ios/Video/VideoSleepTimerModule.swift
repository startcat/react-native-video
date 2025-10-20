import Foundation
import AVFoundation
import React

@objc(VideoSleepTimerModule)
class VideoSleepTimerModule: RCTEventEmitter {
    
    private static let TAG = "VideoSleepTimerModule"
    
    // Estado del timer (global, singleton)
    private static var sleepTimer: Timer?
    private static var sleepTimerRemainingSeconds: Int = 0
    private static var sleepTimerActive: Bool = false
    private static var sleepTimerFinishCurrentMode: Bool = false
    
    // MARK: - React Native Module Setup
    
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    override func supportedEvents() -> [String]! {
        return ["sleepTimerFinished"]
    }
    
    override init() {
        super.init()
        
        // Escuchar notificación de fin de player
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handlePlayerDidEnd),
            name: NSNotification.Name("RCTVideoPlayerDidEnd"),
            object: nil
        )
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
        cancelSleepTimer()
    }
    
    /**
     * Maneja la notificación cuando el player termina
     */
    @objc private func handlePlayerDidEnd() {
        RCTLogInfo("🔔 [SLEEP TIMER iOS] Received player did end notification")
        
        if VideoSleepTimerModule.sleepTimerActive && VideoSleepTimerModule.sleepTimerFinishCurrentMode {
            RCTLogInfo("🔔 [SLEEP TIMER iOS] ⏸️ Player ended in finish-current mode - PAUSING")
            
            // Cancelar timer
            VideoSleepTimerModule.sleepTimer?.invalidate()
            VideoSleepTimerModule.sleepTimer = nil
            VideoSleepTimerModule.sleepTimerRemainingSeconds = 0
            VideoSleepTimerModule.sleepTimerActive = false
            VideoSleepTimerModule.sleepTimerFinishCurrentMode = false
            
            // Emitir evento a JavaScript
            sendEvent(withName: "sleepTimerFinished", body: nil)
            RCTLogInfo("🔔 [SLEEP TIMER iOS] ✅ Event emitted to JavaScript")
        } else {
            RCTLogInfo("🔔 [SLEEP TIMER iOS] Player ended but timer not in finish-current mode (active=\(VideoSleepTimerModule.sleepTimerActive), finishCurrentMode=\(VideoSleepTimerModule.sleepTimerFinishCurrentMode))")
        }
    }
    
    // MARK: - Public Methods
    
    /**
     * Activa el sleep timer con los segundos especificados
     * Si ya existe un timer activo, lo reinicia con el nuevo valor
     */
    @objc func activateSleepTimer(_ seconds: NSNumber) {
        DispatchQueue.main.async {
            RCTLogInfo("🔔 [SLEEP TIMER iOS] ========================================")
            RCTLogInfo("🔔 [SLEEP TIMER iOS] activateSleepTimer called with \(seconds) seconds")
            
            // Cancelar timer existente si lo hay (directamente, sin dispatch anidado)
            VideoSleepTimerModule.sleepTimer?.invalidate()
            VideoSleepTimerModule.sleepTimer = nil
            
            // Configurar nuevo timer en modo tiempo
            VideoSleepTimerModule.sleepTimerRemainingSeconds = seconds.intValue
            VideoSleepTimerModule.sleepTimerActive = true
            VideoSleepTimerModule.sleepTimerFinishCurrentMode = false
            
            RCTLogInfo("🔔 [SLEEP TIMER iOS] Timer configured: active=\(VideoSleepTimerModule.sleepTimerActive), remaining=\(VideoSleepTimerModule.sleepTimerRemainingSeconds), finishCurrentMode=\(VideoSleepTimerModule.sleepTimerFinishCurrentMode)")
            
            // Crear timer que se ejecuta cada segundo
            VideoSleepTimerModule.sleepTimer = Timer.scheduledTimer(
                withTimeInterval: 1.0,
                repeats: true
            ) { [weak self] _ in
                self?.sleepTimerTick()
            }
            
            RCTLogInfo("🔔 [SLEEP TIMER iOS] Timer scheduled successfully")
            RCTLogInfo("🔔 [SLEEP TIMER iOS] ========================================")
        }
    }
    
    /**
     * Activa el sleep timer en modo "Finalizar episodio actual"
     * La reproducción se pausará cuando el media actual llegue a su fin
     */
    @objc func activateFinishCurrentTimer() {
        DispatchQueue.main.async {
            RCTLogInfo("🔔 [SLEEP TIMER iOS] ========================================")
            RCTLogInfo("🔔 [SLEEP TIMER iOS] activateFinishCurrentTimer called")
            
            // Cancelar timer existente si lo hay (directamente, sin dispatch anidado)
            VideoSleepTimerModule.sleepTimer?.invalidate()
            VideoSleepTimerModule.sleepTimer = nil
            
            // Configurar timer en modo finish-current
            VideoSleepTimerModule.sleepTimerRemainingSeconds = -1 // -1 indica modo finish-current
            VideoSleepTimerModule.sleepTimerActive = true
            VideoSleepTimerModule.sleepTimerFinishCurrentMode = true
            
            RCTLogInfo("🔔 [SLEEP TIMER iOS] Timer configured: active=\(VideoSleepTimerModule.sleepTimerActive), finishCurrentMode=\(VideoSleepTimerModule.sleepTimerFinishCurrentMode)")
            RCTLogInfo("🔔 [SLEEP TIMER iOS] Will pause when current media ends")
            RCTLogInfo("🔔 [SLEEP TIMER iOS] ========================================")
        }
    }
    
    /**
     * Cancela el sleep timer activo
     */
    @objc func cancelSleepTimer() {
        DispatchQueue.main.async {
            RCTLogInfo("🔔 [SLEEP TIMER iOS] cancelSleepTimer called")
            
            VideoSleepTimerModule.sleepTimer?.invalidate()
            VideoSleepTimerModule.sleepTimer = nil
            VideoSleepTimerModule.sleepTimerRemainingSeconds = 0
            VideoSleepTimerModule.sleepTimerActive = false
            VideoSleepTimerModule.sleepTimerFinishCurrentMode = false
            
            RCTLogInfo("🔔 [SLEEP TIMER iOS] Timer canceled: active=\(VideoSleepTimerModule.sleepTimerActive)")
        }
    }
    
    /**
     * Obtiene el estado actual del sleep timer
     */
    @objc func getSleepTimerStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            RCTLogInfo("🔔 [SLEEP TIMER iOS] getSleepTimerStatus called: active=\(VideoSleepTimerModule.sleepTimerActive), remaining=\(VideoSleepTimerModule.sleepTimerRemainingSeconds), finishCurrentMode=\(VideoSleepTimerModule.sleepTimerFinishCurrentMode)")
            
            let status: [String: Any] = [
                "isActive": VideoSleepTimerModule.sleepTimerActive,
                "remainingSeconds": VideoSleepTimerModule.sleepTimerRemainingSeconds,
                "isFinishCurrentMode": VideoSleepTimerModule.sleepTimerFinishCurrentMode
            ]
            
            resolve(status)
        }
    }
    
    /**
     * Método público para notificar que el media ha terminado desde JavaScript
     * Útil cuando la app está en foreground y JavaScript detecta onEnd
     */
    @objc func notifyMediaEnded() {
        DispatchQueue.main.async {
            RCTLogInfo("🔔 [SLEEP TIMER iOS] notifyMediaEnded called from JavaScript")
            self.handleMediaEnded()
        }
    }
    
    // MARK: - Private Methods
    
    /**
     * Tick del timer que se ejecuta cada segundo
     */
    private func sleepTimerTick() {
        guard VideoSleepTimerModule.sleepTimerActive else {
            RCTLogInfo("🔔 [SLEEP TIMER iOS] sleepTimerTick called but timer is NOT active")
            return
        }
        
        VideoSleepTimerModule.sleepTimerRemainingSeconds -= 1
        
        RCTLogInfo("🔔 [SLEEP TIMER iOS] ⏱️ TICK - remaining: \(VideoSleepTimerModule.sleepTimerRemainingSeconds) seconds")
        
        // Si llegamos a 0, pausar
        if VideoSleepTimerModule.sleepTimerRemainingSeconds <= 0 {
            RCTLogInfo("🔔 [SLEEP TIMER iOS] ⏸️ Timer reached 0 - PAUSING playback")
            cancelSleepTimer()
            pauseViaEvent()
        }
    }
    
    /**
     * Maneja el evento de media terminado
     * Lógica centralizada para finish-current mode
     */
    private func handleMediaEnded() {
        RCTLogInfo("🔔 [SLEEP TIMER iOS] handleMediaEnded called")
        
        if VideoSleepTimerModule.sleepTimerActive && VideoSleepTimerModule.sleepTimerFinishCurrentMode {
            RCTLogInfo("🔔 [SLEEP TIMER iOS] ⏸️ Media ended in finish-current mode - PAUSING")
            cancelSleepTimer()
            pauseViaEvent()
        } else {
            RCTLogInfo("🔔 [SLEEP TIMER iOS] Media ended but timer not in finish-current mode (active=\(VideoSleepTimerModule.sleepTimerActive), finishCurrentMode=\(VideoSleepTimerModule.sleepTimerFinishCurrentMode))")
        }
    }
    
    /**
     * Pausa la reproducción emitiendo un evento a JavaScript
     * El AudioFlavour escuchará este evento y pausará el player
     */
    private func pauseViaEvent() {
        RCTLogInfo("🔔 [SLEEP TIMER iOS] Emitting sleepTimerFinished event to JavaScript")
        
        sendEvent(withName: "sleepTimerFinished", body: nil)
        
        RCTLogInfo("🔔 [SLEEP TIMER iOS] ✅ Event emitted successfully")
    }
}
