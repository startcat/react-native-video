/*
 * Copyright (C) 2016 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.brentvatne.license.internal.model;

import com.brentvatne.license.internal.utils.LicenseManagerUtils;

/**
 * Abstract base class representing an MP4 atom (also known as box).
 * An atom is a basic unit of data in MP4 files, containing a type identifier
 * and associated data. This class provides common functionality for parsing
 * and working with atom types.
 */
public abstract class Atom {

    /**
     * Size of a full atom header, in bytes.
     */
    public static final int FULL_HEADER_SIZE = 12;

    // Common atom types
    public static final int TYPE_pssh = LicenseManagerUtils.getIntegerCodeForString("pssh");
    public static final int TYPE_ftyp = LicenseManagerUtils.getIntegerCodeForString("ftyp");
    public static final int TYPE_moov = LicenseManagerUtils.getIntegerCodeForString("moov");
    public static final int TYPE_mdat = LicenseManagerUtils.getIntegerCodeForString("mdat");
    public static final int TYPE_free = LicenseManagerUtils.getIntegerCodeForString("free");
    public static final int TYPE_skip = LicenseManagerUtils.getIntegerCodeForString("skip");

    public final int type;

    /**
     * Creates a new Atom with the specified type.
     * 
     * @param type The atom type identifier
     * @throws IllegalArgumentException if type is 0 (invalid atom type)
     */
    public Atom(int type) {
        if (type == 0) {
            throw new IllegalArgumentException("Atom type cannot be 0 (invalid atom type)");
        }
        this.type = type;
    }

    @Override
    public String toString() {
        return getAtomTypeString(type);
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (obj == null || getClass() != obj.getClass()) {
            return false;
        }
        Atom atom = (Atom) obj;
        return type == atom.type;
    }

    @Override
    public int hashCode() {
        return type;
    }

    /**
     * Parses the version number out of the additional integer component of a full atom.
     *
     * @param fullAtomInt full atom int
     * @return int
     */
    public static int parseFullAtomVersion(int fullAtomInt) {
        return 0x000000FF & (fullAtomInt >> 24);
    }

    /**
     * Converts a numeric atom type to the corresponding four character string.
     * Non-printable characters are replaced with '?' for better readability.
     *
     * @param type The numeric atom type.
     * @return The corresponding four character string with printable characters.
     */
    public static String getAtomTypeString(int type) {
        char c1 = (char) ((type >> 24) & 0xFF);
        char c2 = (char) ((type >> 16) & 0xFF);
        char c3 = (char) ((type >> 8) & 0xFF);
        char c4 = (char) (type & 0xFF);
        
        // Replace non-printable characters with '?' for better readability
        if (!isPrintable(c1)) c1 = '?';
        if (!isPrintable(c2)) c2 = '?';
        if (!isPrintable(c3)) c3 = '?';
        if (!isPrintable(c4)) c4 = '?';
        
        return "" + c1 + c2 + c3 + c4;
    }
    
    /**
     * Checks if a character is printable (visible ASCII character).
     * 
     * @param c The character to check
     * @return true if the character is printable, false otherwise
     */
    private static boolean isPrintable(char c) {
        return c >= 32 && c <= 126; // Printable ASCII range
    }

    /**
     * Checks if the given type is a valid atom type.
     * A valid atom type is non-zero.
     * 
     * @param type The atom type to validate
     * @return true if the type is valid, false otherwise
     */
    public static boolean isValidAtomType(int type) {
        return type != 0;
    }

}
