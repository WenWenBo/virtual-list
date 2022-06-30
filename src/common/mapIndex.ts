import { VIRTUAL_ORIGINAL_INDEX } from "./constant";

/**
 * 
 * @param index 虚拟下标
 * @param originalIndex 原点位置下标
 * @returns 真实下标
 */
export function getRealIndex(index: number = VIRTUAL_ORIGINAL_INDEX, originalIndex: number = 0): number{
    return index - (VIRTUAL_ORIGINAL_INDEX - originalIndex);
}

/**
 * 
 * @param index 真实下标
 * @param originalIndex 原点位置下标
 * @returns 虚拟下标
 */
export function getVirtualIndex(index: number = 0, originalIndex: number = 0): number{
    return index + (VIRTUAL_ORIGINAL_INDEX - originalIndex);
}