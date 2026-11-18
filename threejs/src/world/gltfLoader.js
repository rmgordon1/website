import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { DRACO_PATH } from '../config.js'

/** One Draco decoder for every model. Where its files come from is set in config.js. */
let draco = null

/**
 * A GLTFLoader that can open Draco-compressed meshes. Use this instead of
 * `new GLTFLoader()`, so a model exported with compression still loads.
 */
export function createGLTFLoader()
{
    if (!draco)
    {
        draco = new DRACOLoader()
        draco.setDecoderPath(DRACO_PATH)
    }

    return new GLTFLoader().setDRACOLoader(draco)
}
