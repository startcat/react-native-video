# Fase 3: Estrategia de Testing — Android Native Module

Basado en las conclusiones de las Fases 1 y 2.

---

## Nota sobre infraestructura de tests

**No existe infraestructura de tests actualmente.** El `build.gradle` no incluye dependencias de testing y no hay directorio `src/test/` ni `src/androidTest/`. Antes de implementar cualquier test, es necesario:

### Setup requerido en `build.gradle`

```groovy
dependencies {
    // ... dependencias existentes ...

    // Unit tests
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'org.mockito:mockito-core:5.8.0'
    testImplementation 'org.mockito:mockito-inline:5.2.0'  // Para mockear clases final/static
    testImplementation 'org.robolectric:robolectric:4.11.1'
    testImplementation 'androidx.test:core:1.5.0'
    testImplementation 'org.json:json:20231013'  // Para WritableMap/ReadableMap mocks

    // Android instrumented tests (opcional, para tests de integración)
    androidTestImplementation 'androidx.test.ext:junit:1.1.5'
    androidTestImplementation 'androidx.test:runner:1.5.2'
    androidTestImplementation 'org.mockito:mockito-android:5.8.0'
}
```

### Estructura de directorios a crear

```
android/src/
├── test/java/com/brentvatne/
│   ├── exoplayer/
│   │   ├── drm/
│   │   ├── source/
│   │   ├── tracks/
│   │   ├── buffer/
│   │   ├── events/
│   │   └── ads/
│   ├── react/
│   │   └── downloads/
│   ├── offline/
│   ├── license/
│   │   └── internal/
│   └── util/
└── androidTest/java/com/brentvatne/  (para tests de integración)
```

---

## 3.1 Tests de contrato (red de seguridad pre-refactorización)

Estos tests capturan el comportamiento actual antes de cualquier refactorización. Se centran en las unidades que se van a extraer (Fase 2).

### 3.1.1 Tests para DownloadErrorClassifier (Paso 1 de migración)

```java
package com.brentvatne.react.downloads;

import static org.junit.Assert.*;

import org.junit.Test;

import androidx.media3.exoplayer.offline.Download;

/**
 * Tests de contrato para la lógica de clasificación de errores de descarga.
 * Captura el comportamiento actual de isNoSpaceLeftError() y mapDownloadState()
 * antes de extraerlos a DownloadErrorClassifier.
 */
public class DownloadErrorClassifierTest {

    // =========================================================================
    // mapDownloadState
    // =========================================================================

    @Test
    public void mapDownloadState_completed_returnsCompleted() {
        assertEquals("COMPLETED", DownloadErrorClassifier.mapDownloadState(Download.STATE_COMPLETED));
    }

    @Test
    public void mapDownloadState_failed_returnsFailed() {
        assertEquals("FAILED", DownloadErrorClassifier.mapDownloadState(Download.STATE_FAILED));
    }

    @Test
    public void mapDownloadState_removing_returnsRemoving() {
        assertEquals("REMOVING", DownloadErrorClassifier.mapDownloadState(Download.STATE_REMOVING));
    }

    @Test
    public void mapDownloadState_downloading_returnsDownloading() {
        assertEquals("DOWNLOADING", DownloadErrorClassifier.mapDownloadState(Download.STATE_DOWNLOADING));
    }

    @Test
    public void mapDownloadState_queued_returnsQueued() {
        assertEquals("QUEUED", DownloadErrorClassifier.mapDownloadState(Download.STATE_QUEUED));
    }

    @Test
    public void mapDownloadState_restarting_returnsRestarting() {
        assertEquals("RESTARTING", DownloadErrorClassifier.mapDownloadState(Download.STATE_RESTARTING));
    }

    @Test
    public void mapDownloadState_stopped_returnsStopped() {
        assertEquals("STOPPED", DownloadErrorClassifier.mapDownloadState(Download.STATE_STOPPED));
    }

    @Test
    public void mapDownloadState_unknownValue_returnsUnknown() {
        assertEquals("UNKNOWN", DownloadErrorClassifier.mapDownloadState(999));
    }

    // =========================================================================
    // isNoSpaceLeftError - mensajes directos
    // =========================================================================

    @Test
    public void isNoSpaceLeftError_nullException_returnsFalse() {
        assertFalse(DownloadErrorClassifier.isNoSpaceLeftError(null));
    }

    @Test
    public void isNoSpaceLeftError_nullMessage_returnsFalse() {
        Exception e = new Exception((String) null);
        assertFalse(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }

    @Test
    public void isNoSpaceLeftError_noSpaceLeft_returnsTrue() {
        Exception e = new Exception("No space left on device");
        assertTrue(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }

    @Test
    public void isNoSpaceLeftError_enospc_returnsTrue() {
        Exception e = new Exception("ENOSPC error occurred");
        assertTrue(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }

    @Test
    public void isNoSpaceLeftError_notEnoughSpace_returnsTrue() {
        Exception e = new Exception("Not enough space available");
        assertTrue(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }

    @Test
    public void isNoSpaceLeftError_insufficientStorage_returnsTrue() {
        Exception e = new Exception("Insufficient storage on device");
        assertTrue(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }

    @Test
    public void isNoSpaceLeftError_diskFull_returnsTrue() {
        Exception e = new Exception("Disk full");
        assertTrue(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }

    @Test
    public void isNoSpaceLeftError_spanish_returnsTrue() {
        Exception e = new Exception("No queda espacio en el dispositivo");
        assertTrue(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }

    @Test
    public void isNoSpaceLeftError_caseInsensitive_returnsTrue() {
        Exception e = new Exception("NO SPACE LEFT ON DEVICE");
        assertTrue(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }

    @Test
    public void isNoSpaceLeftError_unrelatedError_returnsFalse() {
        Exception e = new Exception("Network timeout");
        assertFalse(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }

    // =========================================================================
    // isNoSpaceLeftError - causa encadenada
    // =========================================================================

    @Test
    public void isNoSpaceLeftError_causeHasNoSpaceMessage_returnsTrue() {
        Exception cause = new Exception("No space left on device");
        Exception e = new Exception("Download failed", cause);
        assertTrue(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }

    @Test
    public void isNoSpaceLeftError_deepNestedCause_returnsTrue() {
        Exception root = new Exception("No space left on device");
        Exception mid = new Exception("IO error", root);
        Exception e = new Exception("Download failed", mid);
        assertTrue(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }

    @Test
    public void isNoSpaceLeftError_causeWithErrnoException_returnsTrue() {
        // Simula ErrnoException con errno 28 (ENOSPC)
        android.system.ErrnoException errnoEx =
            new android.system.ErrnoException("write", 28);
        Exception e = new java.io.IOException("Write failed", errnoEx);
        assertTrue(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }

    @Test
    public void isNoSpaceLeftError_causeWithDifferentErrno_returnsFalse() {
        // errno 13 = EACCES (Permission denied)
        android.system.ErrnoException errnoEx =
            new android.system.ErrnoException("write", 13);
        Exception e = new java.io.IOException("Write failed", errnoEx);
        assertFalse(DownloadErrorClassifier.isNoSpaceLeftError(e));
    }
}
```

### 3.1.2 Tests para DownloadStatsCalculator (Paso 2 de migración)

```java
package com.brentvatne.react.downloads;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import org.junit.Before;
import org.junit.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import androidx.media3.common.C;
import androidx.media3.exoplayer.offline.Download;
import androidx.media3.exoplayer.offline.DownloadRequest;

/**
 * Tests de contrato para la lógica de cálculo de estadísticas de descarga.
 * Captura el comportamiento actual de calculateAccurateTotalBytes(),
 * calculateDownloadSpeed() y estimateRemainingTime().
 */
public class DownloadStatsCalculatorTest {

    private DownloadStatsCalculator calculator;

    @Before
    public void setUp() {
        calculator = new DownloadStatsCalculator();
    }

    // =========================================================================
    // calculateAccurateTotalBytes
    // =========================================================================

    @Test
    public void accurateTotalBytes_unknownContentLength_noProgress_returnsZero() {
        Download download = createMockDownload(C.LENGTH_UNSET, 0, 0f);
        assertEquals(0, calculator.calculateAccurateTotalBytes(download));
    }

    @Test
    public void accurateTotalBytes_unknownContentLength_withProgress_estimatesFromProgress() {
        // 50MB downloaded, 50% progress → estimated total = 100MB
        long downloaded = 50 * 1024 * 1024L;
        Download download = createMockDownload(C.LENGTH_UNSET, downloaded, 50f);
        long result = calculator.calculateAccurateTotalBytes(download);
        // Estimated: 50MB / 0.5 = 100MB
        assertEquals(100 * 1024 * 1024L, result, 1024); // tolerancia 1KB
    }

    @Test
    public void accurateTotalBytes_knownContentLength_lowProgress_usesReported() {
        // 3% progress, 3MB downloaded, reported 100MB
        long reported = 100 * 1024 * 1024L;
        long downloaded = 3 * 1024 * 1024L;
        Download download = createMockDownload(reported, downloaded, 3f);
        long result = calculator.calculateAccurateTotalBytes(download);
        assertEquals(reported, result);
    }

    @Test
    public void accurateTotalBytes_knownContentLength_highProgress_estimatedCloseToReported_usesReported() {
        // 50% progress, reported 100MB, estimated ~100MB (difference < 10%)
        long reported = 100 * 1024 * 1024L;
        long downloaded = 50 * 1024 * 1024L;
        Download download = createMockDownload(reported, downloaded, 50f);
        long result = calculator.calculateAccurateTotalBytes(download);
        assertEquals(reported, result);
    }

    @Test
    public void accurateTotalBytes_knownContentLength_estimatedMuchSmaller_usesEstimated() {
        // Reported 200MB (full manifest), but estimated 80MB (selected quality)
        // 50% progress, 40MB downloaded → estimated = 80MB
        // Difference: |200-80|/200 = 60% > 10%, and 80 < 200
        long reported = 200 * 1024 * 1024L;
        long downloaded = 40 * 1024 * 1024L;
        Download download = createMockDownload(reported, downloaded, 50f);
        long result = calculator.calculateAccurateTotalBytes(download);
        long estimated = (long) (downloaded / (50f / 100.0));
        assertEquals(estimated, result, 1024);
    }

    @Test
    public void accurateTotalBytes_zeroContentLength_noProgress_returnsZero() {
        Download download = createMockDownload(0, 0, 0f);
        assertEquals(0, calculator.calculateAccurateTotalBytes(download));
    }

    // =========================================================================
    // calculateDownloadSpeed
    // =========================================================================

    @Test
    public void downloadSpeed_firstCall_returnsZero() {
        Download download = createMockDownload(100_000_000L, 10_000_000L, 10f);
        assertEquals(0.0, calculator.calculateDownloadSpeed("dl-1", download), 0.001);
    }

    @Test
    public void downloadSpeed_secondCall_returnsPositiveSpeed() throws InterruptedException {
        Download download1 = createMockDownload(100_000_000L, 10_000_000L, 10f);
        calculator.calculateDownloadSpeed("dl-1", download1);

        // Simular paso de tiempo y más bytes descargados
        Thread.sleep(100);
        Download download2 = createMockDownload(100_000_000L, 15_000_000L, 15f);
        double speed = calculator.calculateDownloadSpeed("dl-1", download2);
        assertTrue("Speed should be positive", speed > 0);
    }

    @Test
    public void downloadSpeed_noNewBytes_returnsZeroOrPositive() throws InterruptedException {
        Download download = createMockDownload(100_000_000L, 10_000_000L, 10f);
        calculator.calculateDownloadSpeed("dl-1", download);

        Thread.sleep(50);
        // Mismos bytes
        double speed = calculator.calculateDownloadSpeed("dl-1", download);
        assertTrue("Speed should be >= 0", speed >= 0);
    }

    @Test
    public void downloadSpeed_clearAll_resetsTracking() {
        Download download = createMockDownload(100_000_000L, 10_000_000L, 10f);
        calculator.calculateDownloadSpeed("dl-1", download);

        calculator.clearAll();

        // After clear, first call returns 0 again
        assertEquals(0.0, calculator.calculateDownloadSpeed("dl-1", download), 0.001);
    }

    // =========================================================================
    // estimateRemainingTime
    // =========================================================================

    @Test
    public void remainingTime_progressComplete_returnsZero() {
        Download download = createMockDownload(100_000_000L, 100_000_000L, 100f);
        assertEquals(0, calculator.estimateRemainingTime("dl-1", download, 100));
    }

    @Test
    public void remainingTime_noSpeed_returnsZero() {
        Download download = createMockDownload(100_000_000L, 50_000_000L, 50f);
        // No previous speed data
        assertEquals(0, calculator.estimateRemainingTime("dl-1", download, 50));
    }

    @Test
    public void remainingTime_zeroContentLength_returnsZero() {
        Download download = createMockDownload(0, 0, 0f);
        assertEquals(0, calculator.estimateRemainingTime("dl-1", download, 0));
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private Download createMockDownload(long contentLength, long bytesDownloaded, float percentDownloaded) {
        Download download = mock(Download.class);
        DownloadRequest request = mock(DownloadRequest.class);

        when(download.contentLength).thenReturn(contentLength);
        when(download.getBytesDownloaded()).thenReturn(bytesDownloaded);
        when(download.getPercentDownloaded()).thenReturn(percentDownloaded);
        download.request = request;
        when(request.id).thenReturn("test-download-id");

        return download;
    }
}
```

### 3.1.3 Tests para DownloadTrackSelector (Paso 3 de migración)

```java
package com.brentvatne.react.downloads;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;

import android.content.Context;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.TrackGroup;
import androidx.media3.exoplayer.offline.DownloadHelper;
import androidx.media3.exoplayer.source.TrackGroupArray;
import androidx.media3.exoplayer.trackselection.MappingTrackSelector;

/**
 * Tests de contrato para la lógica de selección de tracks para descarga.
 * Verifica que selectQualityTracks selecciona el track correcto según calidad.
 */
@RunWith(RobolectricTestRunner.class)
public class DownloadTrackSelectorTest {

    // =========================================================================
    // Constantes de calidad
    // =========================================================================

    @Test
    public void bitrateConstants_matchExpectedValues() {
        assertEquals(1_500_000, DownloadTrackSelector.BITRATE_LOW);
        assertEquals(3_000_000, DownloadTrackSelector.BITRATE_MEDIUM);
        assertEquals(6_000_000, DownloadTrackSelector.BITRATE_HIGH);
    }

    // =========================================================================
    // selectQualityTracks - casos de calidad
    // =========================================================================

    @Test
    public void selectQualityTracks_lowQuality_selectsTrackUnderThreshold() {
        DownloadHelper helper = createMockHelperWithVideoTracks(
            new int[]{500_000, 1_470_000, 2_300_000, 5_180_000}
        );
        Context context = RuntimeEnvironment.getApplication();

        DownloadTrackSelector.selectQualityTracks(helper, "low", context);

        // Debería seleccionar el track de 1.47Mbps (el más alto <= 1.5Mbps)
        verify(helper).addTrackSelectionForSingleRenderer(
            eq(0), eq(0), any(), argThat(overrides ->
                overrides.size() == 1 && overrides.get(0).tracks[0] == 1
            )
        );
    }

    @Test
    public void selectQualityTracks_autoQuality_selectsAllAudioTracks() {
        DownloadHelper helper = createMockHelperWithAudioTracks(
            new String[]{"es", "eu", "en"}
        );
        Context context = RuntimeEnvironment.getApplication();

        DownloadTrackSelector.selectQualityTracks(helper, "auto", context);

        // Debería llamar addAudioLanguagesToSelection con los 3 idiomas
        verify(helper).addAudioLanguagesToSelection(
            argThat(langs -> langs.length == 3)
        );
    }

    @Test
    public void selectQualityTracks_unknownQuality_treatedAsAuto() {
        DownloadHelper helper = createMockHelperWithVideoTracks(
            new int[]{1_000_000, 3_000_000}
        );
        Context context = RuntimeEnvironment.getApplication();

        // "unknown" debería comportarse como "auto"
        DownloadTrackSelector.selectQualityTracks(helper, "unknown", context);

        // No debería llamar clearTrackSelections (solo se llama para low/medium/high)
        verify(helper, never()).clearTrackSelections(anyInt());
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private DownloadHelper createMockHelperWithVideoTracks(int[] bitrates) {
        DownloadHelper helper = mock(DownloadHelper.class);
        when(helper.getPeriodCount()).thenReturn(1);

        MappingTrackSelector.MappedTrackInfo mappedTrackInfo =
            mock(MappingTrackSelector.MappedTrackInfo.class);
        when(helper.getMappedTrackInfo(0)).thenReturn(mappedTrackInfo);
        when(mappedTrackInfo.getRendererCount()).thenReturn(1);
        when(mappedTrackInfo.getRendererType(0)).thenReturn(C.TRACK_TYPE_VIDEO);

        TrackGroup trackGroup = createTrackGroupWithBitrates(bitrates);
        TrackGroupArray trackGroupArray = new TrackGroupArray(trackGroup);
        when(mappedTrackInfo.getTrackGroups(0)).thenReturn(trackGroupArray);

        return helper;
    }

    private DownloadHelper createMockHelperWithAudioTracks(String[] languages) {
        DownloadHelper helper = mock(DownloadHelper.class);
        when(helper.getPeriodCount()).thenReturn(1);

        MappingTrackSelector.MappedTrackInfo mappedTrackInfo =
            mock(MappingTrackSelector.MappedTrackInfo.class);
        when(helper.getMappedTrackInfo(0)).thenReturn(mappedTrackInfo);
        when(mappedTrackInfo.getRendererCount()).thenReturn(1);
        when(mappedTrackInfo.getRendererType(0)).thenReturn(C.TRACK_TYPE_AUDIO);

        Format[] formats = new Format[languages.length];
        for (int i = 0; i < languages.length; i++) {
            formats[i] = new Format.Builder()
                .setLanguage(languages[i])
                .setLabel("Audio " + languages[i])
                .build();
        }
        TrackGroup trackGroup = new TrackGroup(formats);
        TrackGroupArray trackGroupArray = new TrackGroupArray(trackGroup);
        when(mappedTrackInfo.getTrackGroups(0)).thenReturn(trackGroupArray);

        return helper;
    }

    private TrackGroup createTrackGroupWithBitrates(int[] bitrates) {
        Format[] formats = new Format[bitrates.length];
        for (int i = 0; i < bitrates.length; i++) {
            formats[i] = new Format.Builder()
                .setBitrate(bitrates[i])
                .build();
        }
        return new TrackGroup(formats);
    }
}
```

### 3.1.4 Tests para DrmLicenseQueue (Paso 4 de migración)

```java
package com.brentvatne.react.downloads;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import org.junit.Before;
import org.junit.Test;
import org.mockito.InOrder;

import com.brentvatne.license.OfflineLicenseManager;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;

import java.util.HashMap;
import java.util.Map;

/**
 * Tests de contrato para la cola de descargas de licencias DRM.
 * Verifica que las licencias se descargan secuencialmente.
 */
public class DrmLicenseQueueTest {

    private OfflineLicenseManager mockLicenseManager;
    private DrmLicenseQueue queue;

    @Before
    public void setUp() {
        mockLicenseManager = mock(OfflineLicenseManager.class);
        queue = new DrmLicenseQueue(mockLicenseManager);
    }

    @Test
    public void enqueue_singleItem_downloadsImmediately() {
        MediaItem item = createDrmMediaItem("https://drm.example.com/license", "https://cdn.example.com/video.mpd");
        Map<String, String> drmMessages = new HashMap<>();
        drmMessages.put("https://drm.example.com/license", "test-drm-message");

        queue.enqueue(item, drmMessages);

        verify(mockLicenseManager).downloadLicenseWithResult(
            eq("https://drm.example.com/license"),
            eq("https://cdn.example.com/video.mpd"),
            eq("test-drm-message"),
            eq(true)
        );
    }

    @Test
    public void enqueue_twoItems_secondWaitsForFirst() {
        MediaItem item1 = createDrmMediaItem("https://drm.example.com/license1", "https://cdn.example.com/video1.mpd");
        MediaItem item2 = createDrmMediaItem("https://drm.example.com/license2", "https://cdn.example.com/video2.mpd");
        Map<String, String> drmMessages = new HashMap<>();

        queue.enqueue(item1, drmMessages);
        queue.enqueue(item2, drmMessages);

        // Solo el primero debería haberse descargado
        verify(mockLicenseManager, times(1)).downloadLicenseWithResult(
            anyString(), anyString(), anyString(), anyBoolean()
        );
        assertTrue(queue.isProcessing());
        assertEquals(1, queue.getPendingCount());
    }

    @Test
    public void onCurrentDownloadComplete_processesNext() {
        MediaItem item1 = createDrmMediaItem("https://drm.example.com/license1", "https://cdn.example.com/video1.mpd");
        MediaItem item2 = createDrmMediaItem("https://drm.example.com/license2", "https://cdn.example.com/video2.mpd");
        Map<String, String> drmMessages = new HashMap<>();

        queue.enqueue(item1, drmMessages);
        queue.enqueue(item2, drmMessages);

        // Completar el primero
        queue.onCurrentDownloadComplete();

        // Ahora el segundo debería procesarse
        InOrder inOrder = inOrder(mockLicenseManager);
        inOrder.verify(mockLicenseManager).downloadLicenseWithResult(
            contains("license1"), anyString(), anyString(), anyBoolean()
        );
        inOrder.verify(mockLicenseManager).downloadLicenseWithResult(
            contains("license2"), anyString(), anyString(), anyBoolean()
        );
    }

    @Test
    public void clear_emptiesQueue() {
        MediaItem item1 = createDrmMediaItem("https://drm.example.com/license1", "https://cdn.example.com/video1.mpd");
        MediaItem item2 = createDrmMediaItem("https://drm.example.com/license2", "https://cdn.example.com/video2.mpd");
        Map<String, String> drmMessages = new HashMap<>();

        queue.enqueue(item1, drmMessages);
        queue.enqueue(item2, drmMessages);
        queue.clear();

        assertEquals(0, queue.getPendingCount());
        assertFalse(queue.isProcessing());
    }

    @Test
    public void enqueue_noDrmConfig_doesNotDownload() {
        // MediaItem sin DRM configuration
        MediaItem item = new MediaItem.Builder()
            .setMediaId("no-drm")
            .setUri("https://cdn.example.com/video.mpd")
            .build();
        Map<String, String> drmMessages = new HashMap<>();

        queue.enqueue(item, drmMessages);

        verify(mockLicenseManager, never()).downloadLicenseWithResult(
            anyString(), anyString(), anyString(), anyBoolean()
        );
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private MediaItem createDrmMediaItem(String licenseUrl, String contentUrl) {
        return new MediaItem.Builder()
            .setMediaId("test-id")
            .setUri(contentUrl)
            .setDrmConfiguration(
                new MediaItem.DrmConfiguration.Builder(
                    androidx.media3.common.C.WIDEVINE_UUID
                )
                .setLicenseUri(licenseUrl)
                .build()
            )
            .build();
    }
}
```

### 3.1.5 Tests para MediaSourceBuilder (Paso 6 de migración)

```java
package com.brentvatne.exoplayer.source;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import android.net.Uri;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.datasource.DataSource;
import androidx.media3.exoplayer.dash.DashMediaSource;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;

/**
 * Tests de contrato para la construcción de MediaSource.
 * Verifica que se crea el tipo correcto de MediaSource según la URI.
 */
@RunWith(RobolectricTestRunner.class)
public class MediaSourceBuilderTest {

    @Test
    public void inferContentType_dashExtension_returnsDash() {
        Uri uri = Uri.parse("https://example.com/video.mpd");
        assertEquals(C.CONTENT_TYPE_DASH, MediaSourceBuilder.inferContentType(uri, null));
    }

    @Test
    public void inferContentType_hlsExtension_returnsHls() {
        Uri uri = Uri.parse("https://example.com/video.m3u8");
        assertEquals(C.CONTENT_TYPE_HLS, MediaSourceBuilder.inferContentType(uri, null));
    }

    @Test
    public void inferContentType_mp4Extension_returnsOther() {
        Uri uri = Uri.parse("https://example.com/video.mp4");
        assertEquals(C.CONTENT_TYPE_OTHER, MediaSourceBuilder.inferContentType(uri, null));
    }

    @Test
    public void inferContentType_explicitExtensionOverridesUri() {
        Uri uri = Uri.parse("https://example.com/video.mp4");
        assertEquals(C.CONTENT_TYPE_DASH, MediaSourceBuilder.inferContentType(uri, "mpd"));
    }

    @Test
    public void inferContentType_rtspScheme_returnsRtsp() {
        Uri uri = Uri.parse("rtsp://example.com/stream");
        assertEquals(C.CONTENT_TYPE_RTSP, MediaSourceBuilder.inferContentType(uri, null));
    }

    @Test
    public void buildMediaSource_dashUri_createsDashSource() {
        DataSource.Factory factory = mock(DataSource.Factory.class);
        Uri uri = Uri.parse("https://example.com/video.mpd");

        MediaSource source = MediaSourceBuilder.buildMediaSource(
            uri, null, factory, null, null, null, false, -1
        );

        assertTrue("Expected DashMediaSource", source instanceof DashMediaSource);
    }

    @Test
    public void buildMediaSource_hlsUri_createsHlsSource() {
        DataSource.Factory factory = mock(DataSource.Factory.class);
        Uri uri = Uri.parse("https://example.com/video.m3u8");

        MediaSource source = MediaSourceBuilder.buildMediaSource(
            uri, null, factory, null, null, null, false, -1
        );

        assertTrue("Expected HlsMediaSource", source instanceof HlsMediaSource);
    }

    @Test
    public void buildMediaSource_mp4Uri_createsProgressiveSource() {
        DataSource.Factory factory = mock(DataSource.Factory.class);
        Uri uri = Uri.parse("https://example.com/video.mp4");

        MediaSource source = MediaSourceBuilder.buildMediaSource(
            uri, null, factory, null, null, null, false, -1
        );

        assertTrue("Expected ProgressiveMediaSource", source instanceof ProgressiveMediaSource);
    }
}
```

### 3.1.6 Tests para DrmUtils (utilidad existente, red de seguridad)

```java
package com.brentvatne.license.internal.utils;

import static org.junit.Assert.*;

import org.junit.Test;

import com.brentvatne.license.internal.model.DrmMessage;

/**
 * Tests de contrato para utilidades DRM existentes.
 * Red de seguridad antes de cualquier refactorización del paquete license.
 */
public class DrmUtilsTest {

    @Test
    public void parseDrmMessage_validJson_returnsMessage() {
        String json = "{\"version\":1,\"com_key_id\":\"test-key-id\",\"message\":{\"type\":\"entitlement_message\",\"version\":2,\"license\":{\"allow_persistence\":true}}}";
        DrmMessage result = DrmUtils.parseDrmMessage(json);
        assertNotNull(result);
        assertEquals("test-key-id", result.getCommonKeyId());
        assertTrue(result.isPersistent());
    }

    @Test
    public void parseDrmMessage_nullInput_returnsNull() {
        DrmMessage result = DrmUtils.parseDrmMessage(null);
        assertNull(result);
    }

    @Test
    public void parseDrmMessage_emptyString_returnsNull() {
        DrmMessage result = DrmUtils.parseDrmMessage("");
        assertNull(result);
    }

    @Test
    public void parseDrmMessage_invalidJson_returnsNull() {
        DrmMessage result = DrmUtils.parseDrmMessage("not-json");
        assertNull(result);
    }

    @Test
    public void getSchemeMimeType_widevine_returnsCenc() {
        String mimeType = DrmUtils.getSchemeMimeType(
            androidx.media3.common.C.WIDEVINE_UUID
        );
        assertEquals("video/mp4", mimeType);
    }
}
```

### 3.1.7 Tests para LicenseFileUtils (utilidad existente, red de seguridad)

```java
package com.brentvatne.license.internal.utils;

import static org.junit.Assert.*;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;

/**
 * Tests de contrato para utilidades de ficheros de licencia.
 * Verifica lectura/escritura/borrado de key set IDs.
 */
public class LicenseFileUtilsTest {

    @Rule
    public TemporaryFolder tempFolder = new TemporaryFolder();

    private String storagePath;

    @Before
    public void setUp() {
        storagePath = tempFolder.getRoot().getAbsolutePath();
        LicenseFileUtils.setStoragePath(storagePath);
    }

    @Test
    public void writeAndRead_roundTrip_succeeds() {
        String manifestUrl = "https://cdn.example.com/video.mpd";
        byte[] keySetId = new byte[]{1, 2, 3, 4, 5};

        LicenseFileUtils.writeKeySetId(manifestUrl, keySetId);
        byte[] result = LicenseFileUtils.readKeySetId(manifestUrl);

        assertNotNull(result);
        assertArrayEquals(keySetId, result);
    }

    @Test
    public void readKeySetId_nonExistentFile_returnsNull() {
        byte[] result = LicenseFileUtils.readKeySetId("https://nonexistent.com/video.mpd");
        assertNull(result);
    }

    @Test
    public void deleteKeySetId_existingFile_deletesSuccessfully() {
        String manifestUrl = "https://cdn.example.com/video.mpd";
        byte[] keySetId = new byte[]{1, 2, 3};

        LicenseFileUtils.writeKeySetId(manifestUrl, keySetId);
        LicenseFileUtils.deleteKeySetId(manifestUrl);

        byte[] result = LicenseFileUtils.readKeySetId(manifestUrl);
        assertNull(result);
    }

    @Test
    public void deleteKeySetId_nonExistentFile_doesNotThrow() {
        // No debería lanzar excepción
        LicenseFileUtils.deleteKeySetId("https://nonexistent.com/video.mpd");
    }

    @Test
    public void deleteAllKeySetIds_clearsAllFiles() {
        LicenseFileUtils.writeKeySetId("https://cdn.example.com/video1.mpd", new byte[]{1});
        LicenseFileUtils.writeKeySetId("https://cdn.example.com/video2.mpd", new byte[]{2});

        LicenseFileUtils.deleteAllKeySetIds();

        assertNull(LicenseFileUtils.readKeySetId("https://cdn.example.com/video1.mpd"));
        assertNull(LicenseFileUtils.readKeySetId("https://cdn.example.com/video2.mpd"));
    }

    @Test
    public void listKeySetIds_returnsAllStored() {
        LicenseFileUtils.writeKeySetId("https://cdn.example.com/video1.mpd", new byte[]{1});
        LicenseFileUtils.writeKeySetId("https://cdn.example.com/video2.mpd", new byte[]{2});

        String[] files = LicenseFileUtils.listKeySetIds();
        assertNotNull(files);
        assertEquals(2, files.length);
    }

    @Test
    public void writeKeySetId_createsDirectoryIfNeeded() {
        String deepPath = tempFolder.getRoot().getAbsolutePath() + "/deep/nested/path";
        LicenseFileUtils.setStoragePath(deepPath);

        LicenseFileUtils.writeKeySetId("https://cdn.example.com/video.mpd", new byte[]{1});

        assertTrue(new File(deepPath).exists());
    }
}
```

### 3.1.8 Tests para Utility (utilidad existente, red de seguridad)

```java
package com.brentvatne.util;

import static org.junit.Assert.*;

import org.junit.Test;

import java.util.UUID;

import androidx.media3.common.C;

/**
 * Tests de contrato para utilidades generales.
 */
public class UtilityTest {

    @Test
    public void getDrmScheme_widevineUuid_returnsWidevine() {
        String scheme = Utility.getDrmScheme(C.WIDEVINE_UUID);
        assertEquals("widevine", scheme);
    }

    @Test
    public void getDrmScheme_playreadyUuid_returnsPlayready() {
        String scheme = Utility.getDrmScheme(C.PLAYREADY_UUID);
        assertEquals("playready", scheme);
    }

    @Test
    public void getDrmScheme_clearkeyUuid_returnsClearkey() {
        String scheme = Utility.getDrmScheme(C.CLEARKEY_UUID);
        assertEquals("clearkey", scheme);
    }

    @Test
    public void getDrmScheme_unknownUuid_returnsNull() {
        UUID unknown = UUID.randomUUID();
        String scheme = Utility.getDrmScheme(unknown);
        assertNull(scheme);
    }

    @Test
    public void getCurrentTimeString_returnsNonEmpty() {
        String time = Utility.getCurrentTimeString();
        assertNotNull(time);
        assertFalse(time.isEmpty());
    }
}
```

---

## 3.2 Testabilidad actual

| Responsabilidad | Fichero | Testeable aisladamente | Barreras | Tipo de test adecuado |
|---|---|---|---|---|
| Clasificación de errores de descarga | `DownloadsModule2` | **Sí** | Ninguna (lógica pura) | Unitario |
| Cálculo de stats de descarga | `DownloadsModule2` | **Sí** | Requiere mock de `Download` | Unitario |
| Selección de tracks para descarga | `DownloadsModule2` | **Parcial** | Requiere mock de `DownloadHelper`, `MappedTrackInfo` | Unitario con mocks |
| Cola de licencias DRM | `DownloadsModule2` | **Sí** | Requiere mock de `OfflineLicenseManager` | Unitario |
| Mapeo de estado de descarga | `DownloadsModule`/`2` | **Sí** | Ninguna (lógica pura) | Unitario |
| Construcción de MediaSource | `ReactExoplayerView` | **Parcial** | Acoplado a estado del player, requiere mock de factories | Unitario con mocks |
| Inferencia de tipo de contenido | `ReactExoplayerView` | **Sí** | Ninguna (lógica pura) | Unitario |
| Selección de tracks de reproducción | `ReactExoplayerView` | **No** | Acoplado a `player`, `trackSelector`, estado mutable | Integración |
| Inicialización del player | `ReactExoplayerView` | **No** | God Object, 60+ campos mutables, Android Context | Integración / E2E |
| Gestión de DRM | `ReactExoplayerView` | **No** | Acoplado a `MediaDrm`, `OfflineLicenseManager`, red | Integración |
| Integración Youbora | `ReactExoplayerView` | **No** | Acoplado a SDK externo, player, source | Integración |
| Integración IMA Ads | `ReactExoplayerView` | **No** | Acoplado a SDK externo, player, source | Integración |
| Playback service | `ReactExoplayerView` | **No** | Requiere Android Service, MediaSession | Instrumentado |
| Lifecycle de descargas | `DownloadsModule2` | **No** | Acoplado a `AxOfflineManager`, `AxDownloadService`, foreground service | Integración |
| Health check de DownloadManager | `AxOfflineManager` | **Parcial** | Singleton, `Thread.sleep()` | Unitario con refactor |
| High-progress MPD failure | `AxDownloadTracker` | **Parcial** | Requiere mock de `Download`, `DownloadManager` | Unitario con mocks |
| Descarga de licencia DRM | `LicenceDownloadTask` | **No** | AsyncTask, `MediaDrm`, red, ficheros | Integración |
| Lectura/escritura de licencias | `LicenseFileUtils` | **Sí** | Requiere filesystem temporal | Unitario |
| Parsing de DRM messages | `DrmUtils` | **Sí** | Ninguna (lógica pura) | Unitario |
| DRM scheme utilities | `Utility` | **Sí** | Ninguna (lógica pura) | Unitario |
| Notificación de descarga | `AxDownloadService` | **No** | Android Service, NotificationManager | Instrumentado |
| Foreground service management | `VideoPlaybackService` | **No** | Android Service, MediaSession | Instrumentado |

---

## 3.3 Estrategia por tipo de unidad

### Utilidades y funciones puras

**Aplica a**: `DownloadErrorClassifier`, `DownloadStatsCalculator` (parcial), `MediaSourceBuilder` (inferContentType), `DrmUtils`, `LicenseFileUtils`, `Utility`

**Framework**: JUnit 4 + Mockito (para mocks de `Download`)

**Tabla de casos de prueba — DownloadErrorClassifier.mapDownloadState()**:

| Input | Output esperado |
|---|---|
| `Download.STATE_COMPLETED` | `"COMPLETED"` |
| `Download.STATE_FAILED` | `"FAILED"` |
| `Download.STATE_REMOVING` | `"REMOVING"` |
| `Download.STATE_DOWNLOADING` | `"DOWNLOADING"` |
| `Download.STATE_QUEUED` | `"QUEUED"` |
| `Download.STATE_RESTARTING` | `"RESTARTING"` |
| `Download.STATE_STOPPED` | `"STOPPED"` |
| `999` (desconocido) | `"UNKNOWN"` |
| `-1` (negativo) | `"UNKNOWN"` |

**Tabla de casos de prueba — DownloadErrorClassifier.isNoSpaceLeftError()**:

| Input | Output esperado |
|---|---|
| `null` | `false` |
| `Exception(null)` | `false` |
| `Exception("No space left on device")` | `true` |
| `Exception("ENOSPC")` | `true` |
| `Exception("Not enough space")` | `true` |
| `Exception("Insufficient storage")` | `true` |
| `Exception("Disk full")` | `true` |
| `Exception("No queda espacio")` | `true` |
| `Exception("Network timeout")` | `false` |
| `Exception("Download failed", cause=Exception("No space left"))` | `true` |
| `IOException("Write failed", cause=ErrnoException("write", 28))` | `true` |
| `IOException("Write failed", cause=ErrnoException("write", 13))` | `false` |

**Tabla de casos de prueba — DownloadStatsCalculator.calculateAccurateTotalBytes()**:

| contentLength | bytesDownloaded | percentDownloaded | Output esperado |
|---|---|---|---|
| `C.LENGTH_UNSET` | `0` | `0%` | `0` |
| `C.LENGTH_UNSET` | `50MB` | `50%` | `~100MB` (estimado) |
| `100MB` | `3MB` | `3%` | `100MB` (reportado, progress < 5%) |
| `100MB` | `50MB` | `50%` | `100MB` (reportado, diff < 10%) |
| `200MB` | `40MB` | `50%` | `~80MB` (estimado, diff > 10% y estimado < reportado) |
| `0` | `0` | `0%` | `0` |

### Managers (con efectos secundarios)

**Aplica a**: `DrmLicenseQueue`, `PlayerDrmManager`, `PlayerAdsManager`, `PlayerAnalyticsManager`, `PlaybackServiceManager`, `BufferConfigManager`

**Framework**: JUnit 4 + Mockito

**Ejemplo completo — DrmLicenseQueue**:

```java
@Before
public void setUp() {
    mockLicenseManager = mock(OfflineLicenseManager.class);
    queue = new DrmLicenseQueue(mockLicenseManager);
}

@Test
public void serialExecution_threeItems_processedInOrder() {
    MediaItem item1 = createDrmMediaItem("license1", "video1.mpd");
    MediaItem item2 = createDrmMediaItem("license2", "video2.mpd");
    MediaItem item3 = createDrmMediaItem("license3", "video3.mpd");
    Map<String, String> msgs = new HashMap<>();

    queue.enqueue(item1, msgs);
    queue.enqueue(item2, msgs);
    queue.enqueue(item3, msgs);

    // Solo 1 descarga activa
    verify(mockLicenseManager, times(1)).downloadLicenseWithResult(
        anyString(), anyString(), anyString(), anyBoolean()
    );

    // Completar 1 → procesa 2
    queue.onCurrentDownloadComplete();
    verify(mockLicenseManager, times(2)).downloadLicenseWithResult(
        anyString(), anyString(), anyString(), anyBoolean()
    );

    // Completar 2 → procesa 3
    queue.onCurrentDownloadComplete();
    verify(mockLicenseManager, times(3)).downloadLicenseWithResult(
        anyString(), anyString(), anyString(), anyBoolean()
    );

    // Completar 3 → cola vacía
    queue.onCurrentDownloadComplete();
    assertFalse(queue.isProcessing());
    assertEquals(0, queue.getPendingCount());
}

@Test
public void errorInLicenseManager_doesNotBlockQueue() {
    doThrow(new RuntimeException("DRM error"))
        .when(mockLicenseManager)
        .downloadLicenseWithResult(contains("license1"), anyString(), anyString(), anyBoolean());

    MediaItem item1 = createDrmMediaItem("license1", "video1.mpd");
    MediaItem item2 = createDrmMediaItem("license2", "video2.mpd");
    Map<String, String> msgs = new HashMap<>();

    // Enqueue debería capturar el error y continuar
    queue.enqueue(item1, msgs);
    queue.onCurrentDownloadComplete();
    queue.enqueue(item2, msgs);

    // item2 debería procesarse
    verify(mockLicenseManager).downloadLicenseWithResult(
        contains("license2"), anyString(), anyString(), anyBoolean()
    );
}
```

**Mocks necesarios para PlayerDrmManager**:

| Dependencia | Mock | Librería |
|---|---|---|
| `OfflineLicenseManager` | `mock(OfflineLicenseManager.class)` | Mockito |
| `DataSource.Factory` | `mock(DataSource.Factory.class)` | Mockito |
| `Context` | `RuntimeEnvironment.getApplication()` | Robolectric |
| `MediaDrm` | No mockeable directamente (clase final) | `mockito-inline` |

### Orquestadores

**Aplica a**: `ReactExoplayerView` (post-refactorización), `DownloadsModule2` (post-refactorización)

**Framework**: JUnit 4 + Mockito + Robolectric

**Estrategia**: Tras la segmentación, el orquestador se testea verificando que delega correctamente a los managers. Los managers se mockean.

```java
@RunWith(RobolectricTestRunner.class)
public class ReactExoplayerViewOrchestrationTest {

    @Mock PlayerDrmManager drmManager;
    @Mock PlayerAdsManager adsManager;
    @Mock PlayerAnalyticsManager analyticsManager;
    @Mock MediaSourceBuilder sourceBuilder;
    @Mock TrackSelectionManager trackManager;
    @Mock PlayerEventEmitter eventEmitter;
    @Mock BufferConfigManager bufferManager;
    @Mock PlaybackServiceManager serviceManager;

    // Test: initializePlayer delega correctamente
    @Test
    public void initializePlayer_withDrm_delegatesToDrmManager() {
        // Setup
        when(drmManager.buildDrmSessionManager(any(), any(), any()))
            .thenReturn(mock(DrmSessionManager.class));

        // Act
        view.initializePlayer();

        // Verify
        verify(drmManager).buildDrmSessionManager(any(), any(), any());
        verify(bufferManager).buildLoadControl();
        verify(eventEmitter).onVideoLoadStart();
    }

    // Test: error en DRM no corrompe estado del orquestador
    @Test
    public void initializePlayer_drmFails_emitsError() {
        when(drmManager.buildDrmSessionManager(any(), any(), any()))
            .thenThrow(new RuntimeException("DRM init failed"));

        view.initializePlayer();

        verify(eventEmitter).onVideoError(contains("DRM"), any(), anyString());
        // Player no debería estar inicializado
        assertNull(view.getPlayer());
    }
}
```

---

## 3.4 Matriz de cobertura

| ID | Comportamiento | Test unitario | Test integración | Test e2e | Prioridad |
|---|---|---|---|---|---|
| ERR-MAP | Mapeo de estado de descarga a string | ✅ propuesto | ➖ no aplica | ➖ no aplica | media |
| ERR-SPACE | Detección de error de espacio en disco | ✅ propuesto | ➖ no aplica | ➖ no aplica | alta |
| STATS-BYTES | Cálculo preciso de bytes totales | ✅ propuesto | ➖ no aplica | ➖ no aplica | alta |
| STATS-SPEED | Cálculo de velocidad de descarga | ✅ propuesto | ➖ no aplica | ➖ no aplica | media |
| STATS-TIME | Estimación de tiempo restante | ✅ propuesto | ➖ no aplica | ➖ no aplica | media |
| TRACK-QUALITY | Selección de tracks por calidad | ✅ propuesto | ⬜ pendiente | ➖ no aplica | alta |
| TRACK-AUDIO | Selección de todos los audio tracks | ✅ propuesto | ⬜ pendiente | ➖ no aplica | alta |
| TRACK-VIDEO | Selección de video por bitrate | ✅ propuesto | ⬜ pendiente | ➖ no aplica | alta |
| DRM-QUEUE | Cola serializada de licencias DRM | ✅ propuesto | ⬜ pendiente | ➖ no aplica | crítica |
| DRM-PARSE | Parsing de DRM messages | ✅ propuesto | ➖ no aplica | ➖ no aplica | alta |
| DRM-SCHEME | DRM scheme utilities | ✅ propuesto | ➖ no aplica | ➖ no aplica | media |
| LICENSE-IO | Lectura/escritura de ficheros de licencia | ✅ propuesto | ➖ no aplica | ➖ no aplica | alta |
| SOURCE-TYPE | Inferencia de tipo de contenido | ✅ propuesto | ➖ no aplica | ➖ no aplica | alta |
| SOURCE-BUILD | Construcción de MediaSource por tipo | ✅ propuesto | ⬜ pendiente | ➖ no aplica | alta |
| PLAYER-INIT | Inicialización completa del player | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | crítica |
| PLAYER-DRM | Reproducción con DRM online | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | crítica |
| PLAYER-OFFLINE | Reproducción offline con licencia | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | crítica |
| PLAYER-ADS | Reproducción con ads IMA | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| PLAYER-YOUBORA | Integración Youbora analytics | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | media |
| PLAYER-TRACKS | Cambio de tracks durante reproducción | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| PLAYER-FULLSCREEN | Transición fullscreen | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | media |
| PLAYER-SERVICE | Notificación de reproducción background | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | media |
| PLAYER-AUDIO-FOCUS | Gestión de audio focus | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| PLAYER-BUFFER | Estrategia de buffering personalizada | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | media |
| PLAYER-ERROR | Manejo de errores con retry DRM | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | crítica |
| DL-ADD | Flujo completo de añadir descarga | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | crítica |
| DL-REMOVE | Eliminación de descarga con cleanup | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| DL-PAUSE-RESUME | Pausa/resume de descargas | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| DL-LIFECYCLE | Lifecycle del módulo de descargas | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| DL-FOREGROUND | Gestión de foreground service Android 12+ | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| DL-MPD-RECOVERY | High-progress MPD failure recovery | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| DL-HEALTH | Health check y reinicialización de DownloadManager | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |
| DL-HELPER-CLEANUP | Limpieza de helpers con timeout | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | media |
| DL-PROGRESS | Broadcast de progreso de descarga | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | media |
| EVENTS-EMIT | Emisión de eventos al JS | ⬜ pendiente | ⬜ pendiente | ⬜ pendiente | alta |

**Resumen**:
- **✅ Propuestos**: 14 tests unitarios (secciones 3.1.1 - 3.1.8)
- **⬜ Pendientes**: 22 tests que requieren la segmentación de Fase 2 para ser implementables
- **Prioridad crítica sin cobertura**: PLAYER-INIT, PLAYER-DRM, PLAYER-OFFLINE, PLAYER-ERROR, DRM-QUEUE, DL-ADD

**Nota**: Los IDs provisionales (ERR-MAP, STATS-BYTES, etc.) se mapearán a IDs definitivos REQ-XXX en la Fase 4.
