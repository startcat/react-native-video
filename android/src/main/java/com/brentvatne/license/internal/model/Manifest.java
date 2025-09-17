package com.brentvatne.license.internal.model;

/**
 * Model class representing a media manifest containing DRM scheme data.
 * A manifest holds an array of SchemeData objects that define the DRM
 * protection schemes and their associated configuration for media content.
 */

public class Manifest {
    
    /** Array of DRM scheme data configurations */
    private SchemeData[] schemeDatas;

    /**
     * Default constructor creating an empty manifest
     */
    public Manifest() {
        this.schemeDatas = new SchemeData[0]; // Initialize with empty array instead of null
    }

    /**
     * Constructor with scheme data array
     * 
     * @param schemeDatas Array of SchemeData objects (can be null)
     */
    public Manifest(SchemeData[] schemeDatas) {
        this.schemeDatas = schemeDatas != null ? schemeDatas.clone() : new SchemeData[0];
    }

    /**
     * Gets a copy of the scheme data array to prevent external modification
     * 
     * @return A copy of the scheme data array, never null
     */
    public SchemeData[] getSchemeDatas() {
        return schemeDatas != null ? schemeDatas.clone() : new SchemeData[0];
    }

    /**
     * Sets the scheme data array with validation
     * 
     * @param schemeDatas Array of SchemeData objects (null will be converted to empty array)
     */
    public void setSchemeDatas(SchemeData[] schemeDatas) {
        this.schemeDatas = schemeDatas != null ? schemeDatas.clone() : new SchemeData[0];
    }

    /**
     * Gets the number of scheme data entries
     * 
     * @return The count of scheme data entries
     */
    public int getSchemeDataCount() {
        return schemeDatas != null ? schemeDatas.length : 0;
    }

    /**
     * Checks if the manifest has any scheme data
     * 
     * @return true if there are scheme data entries, false otherwise
     */
    public boolean hasSchemeData() {
        return schemeDatas != null && schemeDatas.length > 0;
    }

    /**
     * Gets a specific scheme data by index with bounds checking
     * 
     * @param index The index of the scheme data to retrieve
     * @return The SchemeData at the specified index, or null if index is out of bounds
     */
    public SchemeData getSchemeData(int index) {
        if (schemeDatas != null && index >= 0 && index < schemeDatas.length) {
            return schemeDatas[index];
        }
        return null;
    }

    /**
     * Adds a scheme data entry to the manifest
     * 
     * @param schemeData The SchemeData to add (null values are ignored)
     */
    public void addSchemeData(SchemeData schemeData) {
        if (schemeData == null) {
            return;
        }
        
        if (schemeDatas == null) {
            schemeDatas = new SchemeData[]{schemeData};
        } else {
            SchemeData[] newArray = new SchemeData[schemeDatas.length + 1];
            System.arraycopy(schemeDatas, 0, newArray, 0, schemeDatas.length);
            newArray[schemeDatas.length] = schemeData;
            schemeDatas = newArray;
        }
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (obj == null || getClass() != obj.getClass()) {
            return false;
        }
        Manifest manifest = (Manifest) obj;
        return java.util.Arrays.equals(schemeDatas, manifest.schemeDatas);
    }

    @Override
    public int hashCode() {
        return java.util.Arrays.hashCode(schemeDatas);
    }

    @Override
    public String toString() {
        return "Manifest{" +
                "schemeDatas=" + java.util.Arrays.toString(schemeDatas) +
                ", count=" + getSchemeDataCount() +
                '}';
    }

    /**
     * Validates if this manifest is valid (has at least one scheme data)
     * 
     * @return true if the manifest has scheme data, false otherwise
     */
    public boolean isValid() {
        return hasSchemeData();
    }

    /**
     * Creates a copy of this manifest
     * 
     * @return A new Manifest instance with copied scheme data
     */
    public Manifest copy() {
        return new Manifest(schemeDatas);
    }

    /**
     * Clears all scheme data from the manifest
     */
    public void clear() {
        schemeDatas = new SchemeData[0];
    }
}
