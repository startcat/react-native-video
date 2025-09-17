package com.brentvatne.license.internal.task;

import android.annotation.SuppressLint;
import android.media.MediaDrm;
import android.media.UnsupportedSchemeException;
import android.os.AsyncTask; // TODO: Replace with ExecutorService - AsyncTask is deprecated since API 30
import android.os.Build;
import android.util.Log;
import android.util.Pair;

import androidx.annotation.RequiresApi;

import com.brentvatne.license.LicenseManagerErrorCode;
import com.brentvatne.license.internal.exception.LicenseManagerException;
import com.brentvatne.license.internal.utils.DrmUtils;
import com.brentvatne.license.internal.utils.LicenseFileUtils;
import androidx.media3.common.C;

/**
 * AsyncTask for restoring license keys
 */

public class LicenseRestoreTask extends AsyncTask<LicenseRestoreTask.Params, Void, byte[]> {

    private static final String TAG = "Downloads";
    private String mManifestUrl;
    private LicenseManagerErrorCode mErrorCode = null;
    private String mErrorExtraData;
    private ILicenceRestoreTaskCallback mListener;
    private MediaDrm mMediaDrm;
    private byte[] mSessionId;

    public LicenseRestoreTask(ILicenceRestoreTaskCallback listener) {
        if (listener == null) {
            throw new IllegalArgumentException("Listener cannot be null");
        }
        mListener = listener;
    }

    public interface ILicenceRestoreTaskCallback {
        void onLicenseKeysRestored(String manifestUrl, byte[] keySetId);

        void onLicenseRestoreFailed(LicenseManagerErrorCode errorCode, String errorExtraData, String manifestUrl);
    }

    @SuppressLint("ObsoleteSdkInt")
    @RequiresApi(api = Build.VERSION_CODES.JELLY_BEAN_MR2)
    @Override
    protected byte[] doInBackground(Params... params) {
        if (Build.VERSION.SDK_INT < 18) {
            mErrorCode = LicenseManagerErrorCode.ERROR_300;
            return null;
        }

        if (params == null || params.length == 0 || params[0] == null) {
            mErrorCode = LicenseManagerErrorCode.INVALID_PARAMETER;
            mErrorExtraData = "Parameters cannot be null or empty";
            return null;
        }

        byte[] keySetId = null;
        mManifestUrl = params[0].manifestUrl;
        try {
            Log.d(TAG, "Trying to restore keys for: " + mManifestUrl);
            keySetId = LicenseFileUtils.readLicenseFile(params[0].defaultStoragePath, mManifestUrl);

            // Creating media DRM session
            if (mMediaDrm == null) {
                mMediaDrm = new MediaDrm(C.WIDEVINE_UUID);
                mSessionId = mMediaDrm.openSession();
            }

            mMediaDrm.restoreKeys(mSessionId, keySetId);
            Log.d(TAG, "Keys restored!");
            Pair<Long, Long> remainingSec = DrmUtils.getLicenseDurationRemainingSec(mMediaDrm, mSessionId);
            Log.d(TAG, "remainingSec pair: " + remainingSec);
            if (remainingSec == null || remainingSec.first < params[0].minExpireSecond) {
                throw new LicenseManagerException(LicenseManagerErrorCode.ERROR_308);
            }
        } catch (Exception e) {
            onError(e);
        }

        closeSession();
        return keySetId;
    }

    @RequiresApi(api = Build.VERSION_CODES.JELLY_BEAN_MR2)
    private void closeSession() {
        // CRITICAL: Properly close MediaDrm resources to prevent memory leaks
        if (mMediaDrm != null) {
            try {
                if (mSessionId != null) {
                    mMediaDrm.closeSession(mSessionId);
                    mSessionId = null;
                }
                mMediaDrm.close();
                mMediaDrm = null;
            } catch (Exception e) {
                Log.w(TAG, "Error closing MediaDrm resources: " + e.getMessage());
            }
        }
    }

    private void onError(Exception e) {
        Log.d(TAG, "License check failed with error:\n " + e.toString());
        if (e instanceof LicenseManagerException) {
            mErrorCode = ((LicenseManagerException) e).getErrorCode();
            mErrorExtraData = ((LicenseManagerException) e).getExtraData();
        } else if (e instanceof UnsupportedSchemeException) {
            mErrorCode = LicenseManagerErrorCode.ERROR_301;
            mErrorExtraData = e.getMessage();
        } else {
            mErrorCode = LicenseManagerErrorCode.ERROR_302;
            if (e.getCause() != null) {
                mErrorExtraData = e.getCause().getMessage();
            } else {
                mErrorExtraData = e.getMessage();
            }
        }
    }

    @Override
    protected void onPostExecute(byte[] keySetId) {
        try {
            if (mListener != null) {
                if (mErrorCode == null) mListener.onLicenseKeysRestored(mManifestUrl, keySetId);
                else mListener.onLicenseRestoreFailed(mErrorCode, mErrorExtraData, mManifestUrl);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in onPostExecute callback: " + e.getMessage(), e);
        } finally {
            // Ensure proper cleanup even if callback throws exception
            cleanup();
        }
    }

    private void cleanup() {
        try {
            if (mMediaDrm != null) {
                if (mSessionId != null) {
                    mMediaDrm.closeSession(mSessionId);
                }
                mMediaDrm.close();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error during cleanup: " + e.getMessage());
        } finally {
            mListener = null;
            mMediaDrm = null;
            mSessionId = null;
        }
    }

    public static class Params {
        final long minExpireSecond;
        final String manifestUrl, defaultStoragePath;

        public Params(String manifestUrl, String defaultStoragePath, long minExpireSecond) {
            // Validate required parameters
            if (manifestUrl == null || manifestUrl.trim().isEmpty()) {
                throw new IllegalArgumentException("ManifestUrl cannot be null or empty");
            }
            if (defaultStoragePath == null || defaultStoragePath.trim().isEmpty()) {
                throw new IllegalArgumentException("DefaultStoragePath cannot be null or empty");
            }
            if (minExpireSecond < 0) {
                throw new IllegalArgumentException("MinExpireSecond cannot be negative");
            }
            
            this.manifestUrl = manifestUrl;
            this.defaultStoragePath = defaultStoragePath;
            this.minExpireSecond = minExpireSecond;
        }
    }
}
