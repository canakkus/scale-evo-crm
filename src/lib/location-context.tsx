"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { DEFAULT_VIENNA_COORDS, type Coordinates } from "./distance";

export type LocationMode = "live" | "fixed" | "default";

export interface UserLocationState {
  mode: LocationMode;
  coords: Coordinates;
  label: string;
  address: string | null;
  fixedAddress: string | null;
  fixedCoords: Coordinates | null;
  loadingGps: boolean;
  gpsError: string | null;
  hasPromptedOnLaunch: boolean;
  showPrompt: boolean;
  showSettingsHint: boolean;
  requestLiveLocation: () => Promise<boolean>;
  useFixedLocation: () => void;
  useDefaultLocation: () => void;
  saveFixedLocation: (address: string, lat: number, lng: number) => Promise<void>;
  dismissPrompt: (userChoseNo?: boolean) => void;
  closeSettingsHint: () => void;
}

const LocationContext = createContext<UserLocationState | null>(null);

const STORAGE_KEY_PROMPT = "scale_evo_location_prompt_seen";
const STORAGE_KEY_MODE = "scale_evo_location_mode";
const STORAGE_KEY_LIVE_COORDS = "scale_evo_live_coords";

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<LocationMode>("default");
  const [coords, setCoords] = useState<Coordinates>(DEFAULT_VIENNA_COORDS);
  const [label, setLabel] = useState<string>("Wien Zentrum (Standard)");
  const [address, setAddress] = useState<string | null>(null);

  const [fixedAddress, setFixedAddress] = useState<string | null>(null);
  const [fixedCoords, setFixedCoords] = useState<Coordinates | null>(null);

  const [loadingGps, setLoadingGps] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [hasPromptedOnLaunch, setHasPromptedOnLaunch] = useState<boolean>(true);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [showSettingsHint, setShowSettingsHint] = useState<boolean>(false);

  // 1. Load initial user settings & prompt state
  useEffect(() => {
    const promptSeen = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY_PROMPT);
    if (!promptSeen) {
      setHasPromptedOnLaunch(false);
      const timer = setTimeout(() => setShowPrompt(true), 1200);
      return () => clearTimeout(timer);
    } else {
      setHasPromptedOnLaunch(true);
    }
  }, []);

  // 2. Fetch server settings for fixed base address & preferred mode
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        const user = data.currentUser;
        if (user) {
          if (user.baseAddress && user.baseLatitude && user.baseLongitude) {
            const fc: Coordinates = { lat: user.baseLatitude, lng: user.baseLongitude };
            setFixedAddress(user.baseAddress);
            setFixedCoords(fc);

            const savedMode = localStorage.getItem(STORAGE_KEY_MODE) as LocationMode | null;
            const effectiveMode = savedMode || (user.preferredLocationMode as LocationMode) || "fixed";

            if (effectiveMode === "fixed") {
              setMode("fixed");
              setCoords(fc);
              setAddress(user.baseAddress);
              setLabel(`${user.baseAddress}`);
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch location settings:", err);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Request Live Browser GPS
  const requestLiveLocation = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setGpsError("Geolocation wird von diesem Browser leider nicht unterstützt.");
      return false;
    }

    setLoadingGps(true);
    setGpsError(null);

    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const liveCoords: Coordinates = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCoords(liveCoords);
          setMode("live");
          setLabel("Live-Standort (GPS)");
          setAddress(null);
          setLoadingGps(false);
          localStorage.setItem(STORAGE_KEY_MODE, "live");
          localStorage.setItem(STORAGE_KEY_LIVE_COORDS, JSON.stringify(liveCoords));
          resolve(true);
        },
        (error) => {
          let msg = "Standort konnte nicht ermittelt werden.";
          if (error.code === error.PERMISSION_DENIED) {
            msg = "Standort-Zugriff wurde im Browser verweigert.";
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            msg = "Standort-Signal nicht verfügbar.";
          } else if (error.code === error.TIMEOUT) {
            msg = "Zeitüberschreitung bei Standort-Ermittlung.";
          }
          setGpsError(msg);
          setLoadingGps(false);
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }, []);

  // Use Fixed Location (from Settings)
  const useFixedLocation = useCallback(() => {
    if (fixedCoords && fixedAddress) {
      setMode("fixed");
      setCoords(fixedCoords);
      setAddress(fixedAddress);
      setLabel(`${fixedAddress}`);
      localStorage.setItem(STORAGE_KEY_MODE, "fixed");
    } else {
      useDefaultLocation();
    }
  }, [fixedCoords, fixedAddress]);

  // Use Default Vienna center
  const useDefaultLocation = useCallback(() => {
    setMode("default");
    setCoords(DEFAULT_VIENNA_COORDS);
    setAddress("Stephansplatz, 1010 Wien");
    setLabel("Stephansplatz, 1010 Wien (Standard)");
    localStorage.setItem(STORAGE_KEY_MODE, "default");
  }, []);

  // Save new Fixed Location to Settings API & DB
  const saveFixedLocation = useCallback(
    async (newAddress: string, lat: number, lng: number) => {
      const fc: Coordinates = { lat, lng };
      setFixedAddress(newAddress);
      setFixedCoords(fc);
      setCoords(fc);
      setAddress(newAddress);
      setLabel(newAddress);
      setMode("fixed");
      localStorage.setItem(STORAGE_KEY_MODE, "fixed");

      try {
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseAddress: newAddress,
            baseLatitude: lat,
            baseLongitude: lng,
            preferredLocationMode: "fixed",
          }),
        });
      } catch (err) {
        console.error("Error saving fixed location:", err);
      }
    },
    []
  );

  // Dismiss Launch Prompt
  const dismissPrompt = useCallback((userChoseNo: boolean = false) => {
    setShowPrompt(false);
    setHasPromptedOnLaunch(true);
    localStorage.setItem(STORAGE_KEY_PROMPT, "true");

    if (userChoseNo) {
      setShowSettingsHint(true);
    }
  }, []);

  const closeSettingsHint = useCallback(() => {
    setShowSettingsHint(false);
  }, []);

  return (
    <LocationContext.Provider
      value={{
        mode,
        coords,
        label,
        address,
        fixedAddress,
        fixedCoords,
        loadingGps,
        gpsError,
        hasPromptedOnLaunch,
        showPrompt,
        showSettingsHint,
        requestLiveLocation,
        useFixedLocation,
        useDefaultLocation,
        saveFixedLocation,
        dismissPrompt,
        closeSettingsHint,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useUserLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useUserLocation must be used within a LocationProvider");
  }
  return context;
}
