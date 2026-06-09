package com.brentvatne.exoplayer.androidauto

import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * AndroidAutoBootstrapService
 *
 * HeadlessJsTaskService que inicializa el contexto JavaScript en frío SIN abrir una Activity.
 *
 * Android 15 bloquea (BAL) el startActivity(MainActivity) que se usaba antes: en cold-start
 * de Android Auto el JS nunca se inicializaba y el play no podía resolver la URL del
 * contenido. Arrancar un servicio (no una Activity) no está sujeto a BAL.
 * Lo arranca VideoLibraryCallback.launchAppInBackground() (la sesión canónica).
 *
 * El host debe:
 * 1. Registrar la tarea en su entry point JS:
 *    AppRegistry.registerHeadlessTask('RNVAndroidAutoBootstrap', () => bootstrapTask)
 * 2. Declarar este servicio en su AndroidManifest.xml — los manifests de esta librería
 *    NO se mergean en el host (ver contracts/host-app-android-manifest-contract.md).
 */
class AndroidAutoBootstrapService : HeadlessJsTaskService() {

    companion object {
        private const val TAG = "AndroidAutoBootstrap"

        /** Clave de la headless task que el host registra en AppRegistry */
        const val TASK_KEY = "RNVAndroidAutoBootstrap"
    }

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
        Log.i(TAG, "Starting headless JS bootstrap task ($TASK_KEY)")
        return HeadlessJsTaskConfig(
            TASK_KEY,
            Arguments.createMap(),
            // Sin timeout: el bootstrap espera la inicialización JS + red
            0L,
            // Permitida también con la app en foreground (el guard appLaunchAttempted
            // del caller evita arranques redundantes)
            true
        )
    }
}
