# Tarea: Refactorizar ContentKeyManager.swift

> Tarea 19 de 20 | Fase E: Eliminación de complejidad y limpieza
> Plan de refactorización de iOS Native Downloads (`/ios`)

## Contexto

Tras extraer `ContentKeyPersistence` y `FPSCertificateProvider` (tarea 16), `ContentKeyManager.swift` sigue teniendo ~400 líneas con el delegado de `AVContentKeySession` y la lógica de solicitud de CKC al KSM. Además, `requestContentKeyFromKeySecurityModule()` usa `URLSession.synchronousDataTask()` que bloquea el hilo (NC-011, SA-09), y el singleton tiene estado mutable compartido entre módulos (SA-03).

**IDs de auditoría relacionados**: SA-01, SA-03, SA-09, NC-007, NC-011

## Objetivo

Refactorizar `ContentKeyManager.swift` para que use las clases extraídas (`ContentKeyPersistence`, `FPSCertificateProvider`), considerar convertir la solicitud de CKC a async, y propagar el header DRM correctamente (NC-007).

## Alcance

### Código afectado

- `ios/Managers/ContentKeyManager.swift` — refactorizar para usar `ContentKeyPersistence` y `FPSCertificateProvider`, eliminar código movido, considerar async para `requestContentKeyFromKeySecurityModule()`

### Fuera de alcance

- NO cambiar la interfaz pública del singleton (mantener compatibilidad con `DownloadsModule2` y `RCTResourceLoaderDelegate`)
- NO eliminar el patrón singleton (requeriría cambios en múltiples consumidores)

## Requisitos funcionales

1. **[SA-03]**: Documentar el riesgo del singleton compartido. Considerar añadir un lock o queue para serializar acceso.
2. **[NC-007]**: Propagar el header `X-AxDRM-Message` desde la configuración DRM en vez de enviarlo vacío (línea 732)
3. **[NC-011]**: Convertir `requestContentKeyFromKeySecurityModule()` a async o documentar la limitación

## Requisitos técnicos

1. `ContentKeyManager` usa `keyPersistence: ContentKeyPersistence` y `certificateProvider: FPSCertificateProvider` como dependencias
2. Eliminar código de persistencia y certificados que ya está en las clases extraídas
3. Para NC-007: añadir propiedad `drmHeaders: [String: String]?` que se propague a la solicitud de CKC
4. Para NC-011: si se convierte a async, usar `async/await` con `URLSession.data(for:)` (iOS 15+). Si no, documentar la limitación.
5. Resultado esperado: ~350-400 líneas (vs 772 originales, ~400 tras tarea 16)

## Cambios de contrato

- **[NC-007]**: El header `X-AxDRM-Message` ahora se propaga desde `drmHeaders` en vez de enviarse vacío. Si el KSM no requiere este header, no hay cambio visible. Si lo requiere, ahora funcionará correctamente.
- **[NC-011]** (si se implementa async): Los callbacks de `AVContentKeySessionDelegate` que llaman a `requestContentKeyFromKeySecurityModule` ahora usan async/await internamente. El comportamiento externo es idéntico.

## Criterios de aceptación

### Funcionales
- [ ] `ContentKeyManager` usa `ContentKeyPersistence` y `FPSCertificateProvider`
- [ ] No hay código duplicado entre `ContentKeyManager` y las clases extraídas
- [ ] El header DRM se propaga correctamente (NC-007)
- [ ] El proyecto compila sin errores

### Testing
- [ ] Tests de contrato de Fase A siguen pasando: `xcodebuild test` ✅
- [ ] Tests nuevos cubren: propagación de headers DRM, integración con clases extraídas

### Calidad
- [ ] Sin errores de compilación
- [ ] Build exitoso en simulador
- [ ] `ContentKeyManager.swift` tiene ≤400 líneas

## Tests

### Tests de contrato que validan esta tarea (ya existen, Fase A)

- `ios/Tests/ContentKeyPersistenceTests.swift` — valida persistencia de claves DRM

### Tests nuevos a crear

- `ios/Tests/ContentKeyManagerIntegrationTests.swift`:
  - `testDRMHeaders_propagatedToKSMRequest`: Verificar que los headers configurados llegan a la solicitud HTTP
  - `testContentKeyManager_usesInjectedPersistence`: Verificar que usa `ContentKeyPersistence` para write/delete
  - `testContentKeyManager_usesInjectedCertificateProvider`: Verificar que usa `FPSCertificateProvider` para certificados

## Dependencias

### Tareas previas requeridas
- Tarea 16 (ContentKeyPersistence + FPSCertificateProvider): las clases deben existir

### Tareas que dependen de esta
- Tarea 20 (limpieza final)

## Riesgo

- **Nivel**: alto
- **Principal riesgo**: `ContentKeyManager` es el corazón del DRM. Cualquier error puede causar que el contenido protegido no se reproduzca ni descargue. La conversión a async puede cambiar el threading de los callbacks.
- **Mitigación**: Testear exhaustivamente con contenido DRM real (reproducción online, descarga offline, playback offline). Si la conversión a async causa problemas, mantener síncrono y documentar.
- **Rollback**: `git revert HEAD`

## Estimación

2-3 horas

## Notas

- La conversión a async de `requestContentKeyFromKeySecurityModule()` requiere iOS 15+ (`URLSession.data(for:)`). Si el proyecto soporta iOS 14, mantener síncrono.
- El typo `deletePeristableContentKey` se puede corregir en esta tarea (renombrar a `deletePersistableContentKey`).
- Para NC-007, la propiedad `drmHeaders` debe ser configurable desde `DownloadsModule2.setupDRMForAsset()` y desde `RCTResourceLoaderDelegate`. Verificar ambos flujos.
- Si se añade un lock/queue para serializar acceso al singleton (SA-03), usar `DispatchQueue` con `.sync` para lecturas y `.async(flags: .barrier)` para escrituras.
