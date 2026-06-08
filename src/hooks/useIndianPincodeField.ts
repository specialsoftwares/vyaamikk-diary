import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import type { Control, UseFormGetValues, UseFormSetValue } from "react-hook-form";
import { useWatch } from "react-hook-form";

import type { PincodeResolution } from "@/domain/indianPostal";
import {
  isValidIndianPincode,
  normalizeIndianPinInput,
  resolveIndianPincode,
} from "@/services/location/pincodeResolver";
import {
  type PostalFieldPrefix,
  legacyLocationFromPostalForm,
  postalFormField,
} from "@/utils/location/postalForm";
import { buildPostalDisplayLabel } from "@/utils/location/postalDisplay";
import { useT } from "@/i18n";

const DEBOUNCE_MS = 450;

export type PincodeFieldStatus = "idle" | "typing" | "resolving" | "success" | "failed" | "invalid";

interface UseIndianPincodeFieldOptions {
  prefix: PostalFieldPrefix;
  control: Control<Record<string, unknown>>;
  setValue: UseFormSetValue<Record<string, unknown>>;
  getValues: UseFormGetValues<Record<string, unknown>>;
  legacyLocationField?: string;
}

export function useIndianPincodeField({
  prefix,
  control,
  setValue,
  getValues,
  legacyLocationField,
}: UseIndianPincodeFieldOptions) {
  const t = useT();
  const pinField = postalFormField(prefix, "Pin");
  const localityField = postalFormField(prefix, "Locality");
  const districtField = postalFormField(prefix, "District");
  const stateField = postalFormField(prefix, "State");
  const displayField = postalFormField(prefix, "DisplayLabel");
  const placeField = postalFormField(prefix, "PlaceName");

  const pinRaw = useWatch({ control, name: pinField });
  const [status, setStatus] = useState<PincodeFieldStatus>("idle");
  const [localities, setLocalities] = useState<string[]>([]);
  const lastResolvedPin = useRef<string | null>(null);
  const userEditedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const applyResolution = useCallback(
    (resolution: PincodeResolution, localityOverride?: string) => {
      const locality = localityOverride ?? resolution.defaultLocality ?? "";
      setValue(localityField, locality, { shouldDirty: true });
      setValue(districtField, resolution.district ?? "", { shouldDirty: true });
      setValue(stateField, resolution.state ?? "", { shouldDirty: true });
      const display = buildPostalDisplayLabel({
        locality: locality || null,
        district: resolution.district,
        state: resolution.state,
      });
      setValue(displayField, display ?? "", { shouldDirty: false });
      if (legacyLocationField) {
        setValue(
          legacyLocationField,
          legacyLocationFromPostalForm(prefix, {
            ...getValues(),
            [pinField]: resolution.pinCode,
            [localityField]: locality,
            [districtField]: resolution.district,
            [stateField]: resolution.state,
          }),
          { shouldDirty: true }
        );
      }
    },
    [
      displayField,
      districtField,
      getValues,
      legacyLocationField,
      localityField,
      pinField,
      prefix,
      setValue,
      stateField,
    ]
  );

  const syncLegacy = useCallback(() => {
    if (!legacyLocationField) return;
    setValue(legacyLocationField, legacyLocationFromPostalForm(prefix, getValues()), {
      shouldDirty: true,
    });
  }, [getValues, legacyLocationField, prefix, setValue]);

  const onPlaceOrLocalityEdited = useCallback(() => {
    userEditedRef.current = true;
    syncLegacy();
  }, [syncLegacy]);

  const runResolve = useCallback(
    async (pin: string) => {
      const id = ++requestIdRef.current;
      setStatus("resolving");
      const resolution = await resolveIndianPincode(pin);
      if (requestIdRef.current !== id) return;

      if (!resolution.success) {
        setStatus("failed");
        setLocalities([]);
        lastResolvedPin.current = pin;
        return;
      }

      setLocalities(resolution.localities);
      lastResolvedPin.current = pin;
      applyResolution(resolution);
      setStatus("success");
    },
    [applyResolution]
  );

  useEffect(() => {
    const pin = normalizeIndianPinInput(String(pinRaw ?? ""));
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (pin.length === 0) {
      setStatus("idle");
      setLocalities([]);
      lastResolvedPin.current = null;
      return;
    }

    if (pin.length < 6) {
      setStatus("typing");
      return;
    }

    if (!isValidIndianPincode(pin)) {
      setStatus("invalid");
      return;
    }

    if (pin === lastResolvedPin.current) {
      return;
    }

    const previousPin = lastResolvedPin.current;

    const startResolve = () => {
      debounceRef.current = setTimeout(() => void runResolve(pin), DEBOUNCE_MS);
    };

    if (previousPin && userEditedRef.current) {
      Alert.alert(t("postal.pinChangeTitle"), t("postal.pinChangeBody"), [
        {
          text: t("postal.pinChangeKeep"),
          style: "cancel",
          onPress: () => setValue(pinField, previousPin, { shouldDirty: true }),
        },
        {
          text: t("postal.pinChangeUpdate"),
          onPress: () => {
            userEditedRef.current = false;
            startResolve();
          },
        },
      ]);
      return;
    }

    userEditedRef.current = false;
    startResolve();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pinRaw, pinField, runResolve, setValue, t]);

  const selectLocality = useCallback(
    (name: string) => {
      userEditedRef.current = true;
      setValue(localityField, name, { shouldDirty: true });
      const district = String(getValues(districtField) ?? "");
      const state = String(getValues(stateField) ?? "");
      setValue(
        displayField,
        buildPostalDisplayLabel({ locality: name, district, state }) ?? "",
        { shouldDirty: false }
      );
      syncLegacy();
    },
    [displayField, districtField, getValues, localityField, setValue, stateField, syncLegacy]
  );

  const pinDisplay = normalizeIndianPinInput(String(pinRaw ?? ""));

  return {
    pinField,
    localityField,
    districtField,
    stateField,
    displayField,
    placeField,
    status,
    localities,
    pinDisplay,
    selectLocality,
    onPlaceOrLocalityEdited,
    isPinInvalid: pinDisplay.length === 6 && !isValidIndianPincode(pinDisplay),
  };
}
