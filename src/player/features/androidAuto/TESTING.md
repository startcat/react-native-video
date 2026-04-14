# Testing Android Auto - FASES 1-4

Esta guía te ayudará a verificar que la implementación actual funciona correctamente.

---

## ⚠️ Limitaciones Actuales

**Lo que SÍ funciona:**
- ✅ Módulo nativo registrado
- ✅ API JavaScript disponible
- ✅ Métodos enable/disable
- ✅ Configurar biblioteca (se guarda en memoria)
- ✅ Registrar callbacks
- ✅ Verificar estado

**Lo que NO funciona aún:**
- ❌ Navegación real en Android Auto (requiere FASE 6: MediaBrowserService)
- ❌ Reproducción desde Android Auto (requiere FASE 6)
- ❌ Caché persistente (requiere FASE 5: MediaCache)
- ❌ Conexión real con Android Auto (requiere FASE 6)

---

## 🔧 Setup Inicial

### **1. Compilar el proyecto**

```bash
# En la raíz del proyecto react-native-video
cd /Users/danimarin/Development/Repositories/react-native-video

# Compilar TypeScript
yarn build

# O si usas npm
npm run build
```

### **2. Verificar que no hay errores de compilación**

Deberías ver que compila sin errores. El warning de `eventEmitter` es esperado y no es un problema.

---

## 📱 Testing en App de Prueba

### **Opción A: Testing Rápido en Consola**

Crea un archivo de prueba temporal en tu app:

```typescript
// TestAndroidAuto.tsx
import React, { useEffect } from 'react';
import { View, Text, Button, Alert } from 'react-native';
import { AndroidAutoControl, type MediaItem } from 'react-native-video';

export function TestAndroidAuto() {
    
    useEffect(() => {
        console.log('=== Android Auto Test Component Mounted ===');
        testModuleAvailability();
    }, []);
    
    // Test 1: Verificar disponibilidad del módulo
    const testModuleAvailability = () => {
        console.log('\n📦 TEST 1: Module Availability');
        console.log('AndroidAutoControl:', AndroidAutoControl);
        console.log('isEnabled:', AndroidAutoControl.isEnabled());
        console.log('✅ Module is available');
    };
    
    // Test 2: Habilitar Android Auto
    const testEnable = async () => {
        console.log('\n🚀 TEST 2: Enable Android Auto');
        try {
            await AndroidAutoControl.enable();
            console.log('✅ Enabled successfully');
            
            const status = await AndroidAutoControl.getConnectionStatus();
            console.log('Status:', status);
            
            Alert.alert('Success', 'Android Auto enabled!');
        } catch (error) {
            console.error('❌ Enable failed:', error);
            Alert.alert('Error', `Failed to enable: ${error}`);
        }
    };
    
    // Test 3: Configurar biblioteca
    const testSetLibrary = async () => {
        console.log('\n📚 TEST 3: Set Media Library');
        
        const library: MediaItem[] = [
            {
                id: 'root_podcasts',
                title: 'Podcasts',
                browsable: true,
                playable: false
            },
            {
                id: 'podcast_1',
                title: 'Episode 1: Introduction',
                subtitle: 'Welcome to our podcast',
                artist: 'Host Name',
                artworkUri: 'https://picsum.photos/200',
                browsable: false,
                playable: true,
                parentId: 'root_podcasts'
            },
            {
                id: 'podcast_2',
                title: 'Episode 2: Deep Dive',
                subtitle: 'Going deeper into the topic',
                artist: 'Host Name',
                artworkUri: 'https://picsum.photos/200',
                browsable: false,
                playable: true,
                parentId: 'root_podcasts'
            }
        ];
        
        try {
            await AndroidAutoControl.setMediaLibrary(library);
            console.log(`✅ Library set with ${library.length} items`);
            Alert.alert('Success', `Library set with ${library.length} items`);
        } catch (error) {
            console.error('❌ Set library failed:', error);
            Alert.alert('Error', `Failed to set library: ${error}`);
        }
    };
    
    // Test 4: Registrar callbacks
    const testCallbacks = () => {
        console.log('\n🎯 TEST 4: Register Callbacks');
        
        // Callback de navegación
        const unsubBrowse = AndroidAutoControl.onBrowseRequest((parentId) => {
            console.log('📂 Browse request received:', parentId);
            
            if (parentId === 'root') {
                return [
                    { id: 'root_podcasts', title: 'Podcasts', browsable: true }
                ];
            }
            
            if (parentId === 'root_podcasts') {
                return [
                    { id: 'podcast_1', title: 'Episode 1', playable: true },
                    { id: 'podcast_2', title: 'Episode 2', playable: true }
                ];
            }
            
            return [];
        });
        
        // Callback de reproducción
        const unsubPlay = AndroidAutoControl.onPlayFromMediaId((mediaId) => {
            console.log('▶️ Play request received:', mediaId);
            Alert.alert('Play Request', `Requested to play: ${mediaId}`);
        });
        
        console.log('✅ Callbacks registered');
        Alert.alert('Success', 'Callbacks registered. Check console for events.');
        
        // Guardar unsubscribe functions para cleanup
        // En producción deberías guardarlas en state o ref
        setTimeout(() => {
            console.log('Cleaning up callbacks...');
            unsubBrowse();
            unsubPlay();
        }, 60000); // Cleanup después de 1 minuto
    };
    
    // Test 5: Actualizar metadata
    const testUpdateMetadata = () => {
        console.log('\n🎵 TEST 5: Update Now Playing');
        
        AndroidAutoControl.updateNowPlaying({
            title: 'Test Episode',
            artist: 'Test Podcast',
            album: 'Season 1',
            artworkUri: 'https://picsum.photos/300',
            duration: 3600,
            position: 120
        });
        
        console.log('✅ Metadata updated');
        Alert.alert('Success', 'Now playing metadata updated');
    };
    
    // Test 6: Verificar estado
    const testGetStatus = async () => {
        console.log('\n📊 TEST 6: Get Connection Status');
        
        try {
            const status = await AndroidAutoControl.getConnectionStatus();
            console.log('Status:', JSON.stringify(status, null, 2));
            
            Alert.alert(
                'Connection Status',
                `Enabled: ${status.enabled}\n` +
                `Connected: ${status.connected}\n` +
                `App Active: ${status.appActive}\n` +
                `JS Ready: ${status.jsReady}`
            );
        } catch (error) {
            console.error('❌ Get status failed:', error);
            Alert.alert('Error', `Failed to get status: ${error}`);
        }
    };
    
    // Test 7: Deshabilitar
    const testDisable = async () => {
        console.log('\n🛑 TEST 7: Disable Android Auto');
        
        try {
            await AndroidAutoControl.disable();
            console.log('✅ Disabled successfully');
            Alert.alert('Success', 'Android Auto disabled');
        } catch (error) {
            console.error('❌ Disable failed:', error);
            Alert.alert('Error', `Failed to disable: ${error}`);
        }
    };
    
    // Test completo secuencial
    const runAllTests = async () => {
        console.log('\n🧪 RUNNING ALL TESTS SEQUENTIALLY\n');
        
        try {
            await testEnable();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            await testSetLibrary();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            testCallbacks();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            testUpdateMetadata();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            await testGetStatus();
            
            console.log('\n✅ ALL TESTS COMPLETED\n');
            Alert.alert('Success', 'All tests completed! Check console for details.');
            
        } catch (error) {
            console.error('\n❌ TEST SUITE FAILED:', error);
            Alert.alert('Error', `Test suite failed: ${error}`);
        }
    };
    
    return (
        <View style={{ flex: 1, padding: 20, backgroundColor: '#f5f5f5' }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
                Android Auto Testing
            </Text>
            
            <Text style={{ marginBottom: 20, color: '#666' }}>
                Tap buttons to test individual features.
                Check console for detailed logs.
            </Text>
            
            <Button title="1. Enable Android Auto" onPress={testEnable} />
            <View style={{ height: 10 }} />
            
            <Button title="2. Set Media Library" onPress={testSetLibrary} />
            <View style={{ height: 10 }} />
            
            <Button title="3. Register Callbacks" onPress={testCallbacks} />
            <View style={{ height: 10 }} />
            
            <Button title="4. Update Metadata" onPress={testUpdateMetadata} />
            <View style={{ height: 10 }} />
            
            <Button title="5. Get Status" onPress={testGetStatus} />
            <View style={{ height: 10 }} />
            
            <Button title="6. Disable Android Auto" onPress={testDisable} color="red" />
            <View style={{ height: 20 }} />
            
            <Button title="🧪 Run All Tests" onPress={runAllTests} color="green" />
        </View>
    );
}
```

### **Opción B: Testing con Hook**

```typescript
// TestAndroidAutoHook.tsx
import React, { useState } from 'react';
import { View, Text, Button } from 'react-native';
import { useAndroidAuto, type MediaItem } from 'react-native-video';

export function TestAndroidAutoHook() {
    const [enabled, setEnabled] = useState(false);
    const [currentMediaId, setCurrentMediaId] = useState<string | null>(null);
    
    const library: MediaItem[] = [
        {
            id: 'podcast_1',
            title: 'Episode 1: Introduction',
            artist: 'Host Name',
            playable: true
        },
        {
            id: 'podcast_2',
            title: 'Episode 2: Deep Dive',
            artist: 'Host Name',
            playable: true
        }
    ];
    
    useAndroidAuto({
        enabled,
        library,
        onPlayFromMediaId: (mediaId) => {
            console.log('▶️ Play requested:', mediaId);
            setCurrentMediaId(mediaId);
        },
        onBrowseRequest: (parentId) => {
            console.log('📂 Browse requested:', parentId);
            return library;
        }
    });
    
    return (
        <View style={{ flex: 1, padding: 20, backgroundColor: '#f5f5f5' }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
                Android Auto Hook Test
            </Text>
            
            <Text style={{ marginBottom: 20 }}>
                Status: {enabled ? '✅ Enabled' : '❌ Disabled'}
            </Text>
            
            {currentMediaId && (
                <Text style={{ marginBottom: 20, color: 'green' }}>
                    Playing: {currentMediaId}
                </Text>
            )}
            
            <Button
                title={enabled ? 'Disable' : 'Enable'}
                onPress={() => setEnabled(!enabled)}
            />
        </View>
    );
}
```

---

## 📋 Checklist de Verificación

### **✅ Verificaciones Básicas**

1. **Compilación TypeScript**
   ```bash
   yarn build
   ```
   - [ ] Compila sin errores
   - [ ] Solo warning de `eventEmitter` (esperado)

2. **Módulo Nativo Disponible**
   ```typescript
   import { NativeModules } from 'react-native';
   console.log(NativeModules.AndroidAutoModule);
   ```
   - [ ] Muestra objeto con métodos
   - [ ] Métodos incluyen: enable, disable, setMediaLibrary, etc.

3. **API JavaScript Disponible**
   ```typescript
   import { AndroidAutoControl } from 'react-native-video';
   console.log(AndroidAutoControl);
   ```
   - [ ] Clase disponible
   - [ ] Métodos estáticos accesibles

### **✅ Tests Funcionales**

4. **Enable/Disable**
   - [ ] `enable()` resuelve sin error
   - [ ] `isEnabled()` retorna `true` después de enable
   - [ ] `disable()` resuelve sin error
   - [ ] `isEnabled()` retorna `false` después de disable

5. **Set Library**
   - [ ] `setMediaLibrary([...])` resuelve sin error
   - [ ] Logs muestran cantidad correcta de items

6. **Callbacks**
   - [ ] `onBrowseRequest()` registra callback
   - [ ] `onPlayFromMediaId()` registra callback
   - [ ] Unsubscribe functions funcionan

7. **Status**
   - [ ] `getConnectionStatus()` retorna objeto correcto
   - [ ] `enabled` refleja estado actual
   - [ ] `appActive` es `true` cuando app está en foreground

### **✅ Tests de Integración**

8. **Ciclo Completo**
   - [ ] Enable → Set Library → Register Callbacks → Disable
   - [ ] Sin crashes
   - [ ] Sin memory leaks
   - [ ] Logs claros en consola

---

## 🐛 Troubleshooting

### **Error: "Native module not found"**

**Causa:** El módulo nativo no está registrado correctamente.

**Solución:**
1. Verificar que `AndroidAutoModule.kt` existe
2. Verificar que está registrado en `ReactVideoPackage.java`
3. Recompilar la app nativa:
   ```bash
   cd android
   ./gradlew clean
   cd ..
   npx react-native run-android
   ```

### **Error: "Only available on Android platform"**

**Causa:** Estás ejecutando en iOS.

**Solución:** Android Auto solo funciona en Android. Usa un emulador o dispositivo Android.

### **Warning: "Not enabled, call enable() first"**

**Causa:** Intentas usar funcionalidad sin habilitar primero.

**Solución:**
```typescript
await AndroidAutoControl.enable();
// Ahora puedes usar otras funciones
```

### **No se ven logs**

**Causa:** Logs nativos no están visibles.

**Solución:**
```bash
# Ver logs de Android
adb logcat | grep AndroidAuto

# O filtrar por tag
adb logcat -s AndroidAutoModule
```

---

## 📊 Resultados Esperados

### **Console Output Esperado:**

```
=== Android Auto Test Component Mounted ===

📦 TEST 1: Module Availability
AndroidAutoControl: [Function]
isEnabled: false
✅ Module is available

🚀 TEST 2: Enable Android Auto
[AndroidAuto] Event system initialized
[AndroidAuto] Enabled successfully
Status: { enabled: true, connected: false, appActive: true, jsReady: true }
✅ Enabled successfully

📚 TEST 3: Set Media Library
[AndroidAuto] Library set with 3 items
✅ Library set with 3 items

🎯 TEST 4: Register Callbacks
[AndroidAuto] Browse callback registered: abc123
[AndroidAuto] Play callback registered
✅ Callbacks registered

🎵 TEST 5: Update Now Playing
[AndroidAuto] Metadata updated
✅ Metadata updated

📊 TEST 6: Get Connection Status
Status: {
  "enabled": true,
  "connected": false,
  "appActive": true,
  "jsReady": true
}

✅ ALL TESTS COMPLETED
```

### **Logs Nativos Esperados (adb logcat):**

```
D/AndroidAutoModule: enable() called
I/AndroidAutoModule: Android Auto enabled successfully
D/AndroidAutoModule: setMediaLibrary() called with 3 items
I/AndroidAutoModule: Media library cached successfully: 3 items
D/AndroidAutoModule: updateNowPlaying() called: Test Episode
D/AndroidAutoModule: Now playing updated: Test Episode
D/AndroidAutoModule: Connection status: enabled=true, appActive=true, jsReady=true
```

---

## 🎯 Próximos Pasos

Una vez que todos estos tests pasen correctamente, estarás listo para:

1. **FASE 5:** Implementar MediaCache (almacenamiento persistente)
2. **FASE 6:** Implementar MediaBrowserService (funcionalidad real de Android Auto)
3. **FASE 7:** Testing en Android Auto real (con coche o emulador Android Auto)

---

## 💡 Tips

1. **Usa React DevTools** para ver el estado en tiempo real
2. **Usa adb logcat** para ver logs nativos detallados
3. **Prueba en dispositivo real** si es posible (mejor que emulador)
4. **Guarda los logs** para debugging futuro
5. **Prueba enable/disable múltiples veces** para verificar estabilidad

---

## ❓ Preguntas Frecuentes

**Q: ¿Por qué `connected` siempre es `false`?**  
A: Porque aún no hemos implementado MediaBrowserService (FASE 6). Por ahora solo verifica que el módulo está habilitado.

**Q: ¿Puedo probar en Android Auto real?**  
A: No todavía. Necesitas FASE 6 (MediaBrowserService) para que Android Auto detecte la app.

**Q: ¿Los callbacks se ejecutan?**  
A: No automáticamente. Se ejecutarán cuando Android Auto los llame (FASE 6). Por ahora solo verificas que se registran correctamente.

**Q: ¿Dónde se guarda la biblioteca?**  
A: Por ahora solo en memoria. En FASE 5 se guardará en SharedPreferences para persistencia.
