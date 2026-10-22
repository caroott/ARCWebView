import { useMemo, useRef } from "react";
import type { ARC } from "@nfdi4plants/arctrl";
import { Banner } from "@primer/react";
import { buildProvenanceIndex } from "../../provenance/buildIndex";
import { errorMessage } from "./errorMessage";
import { ProvenanceExplorer } from "./ProvenanceExplorer";

// The explorer fills its parent, so the box needs an explicit height.
export default function ProvenanceGraph({ arc }: { arc: ARC }) {
    // The generation counts the indexes built so far. It keys the explorer, so a new ARC mounts a fresh one
    // with clean error, canvas, expansion and scroll state.
    const generation = useRef(0);
    // A new index counts as another ARC and resets the explorer, so the index keeps its identity while the ARC stays the same.
    const built = useMemo(() => {
        const key = ++generation.current;
        try {
            return { key, index: buildProvenanceIndex(arc) };
        } catch (error) {
            console.error("Could not build the provenance index", error);
            return { key, error: errorMessage(error) };
        }
    }, [arc]);

    if (built.error !== undefined) {
        return (
            <Banner
                variant="critical"
                title="The provenance graph could not be built."
                description={built.error}
            />
        );
    }
    return (
        <div style={{ height: "70vh", minHeight: "420px" }}>
            <ProvenanceExplorer key={built.key} index={built.index} />
        </div>
    );
}
