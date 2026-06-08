import { useEffect } from "react";
import { useRouter } from "expo-router";

/** Legacy route — new entries use the Business Entry Composer from You `+`. */
export default function NewEntryRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(app)/(tabs)/you");
  }, [router]);
  return null;
}
