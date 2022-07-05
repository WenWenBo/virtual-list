import { createElement, PureComponent } from "react";
import { cancelTimeout, TimeoutID, requestTimeout } from "./common";
import {
  getVirtualIndex,
  DEFAULT_ESTIMATED_ITEM_SIZE,
  IS_SCROLLING_DEBOUNCE_INTERVAL,
} from './common';

type ScrollDirection = "forward" | "backward";

type itemSizeGetter = (index: number) => number;

type HTMLElementEvent<T extends HTMLElement> = Event & {
  target: T
  currentTarget: T
}

type PositionItem = {
  index: number,
  offset: number,
}

type Range = {
  startIndex: number,
  stopIndex: number,
}

type Flag = {
  isInit: Boolean,
  isAdjustScroll: Boolean,
  disableStartReachCallback: Boolean,
  disableEndReachCallback: Boolean,
  followOutput: Boolean,
}

type VirtualIndex = {
  initialIndex: number, // 虚拟的初始下标
  minIndex: number, // 虚拟的最小项下标
  maxIndex: number, // 虚拟的最大项下标
}

type ResetReachCbOption = {
  start: Boolean,
  end: Boolean,
}

type PrevState = {
  originalIndex: number,
  itemCount: number,
}

interface ItemMetadata {
  offset: number;
  size: number;
}

interface MetaData {
  itemMetadataMap: { [index: number]: ItemMetadata };
  estimatedItemSize: number;
  firstMeasuredIndex: number;
  lastMeasuredIndex: number;
}

interface Props {
  children: any;
  itemData: any;
  itemCount: number;
  height: number;
  width: number;
  overscanCount: number;
  itemSize: itemSizeGetter;
  initialIndex: number;
  originalIndex: number;
  reachThreshold: number;
  estimatedItemSize: number;
  className?: string;
  style?: Object;
  outerRef?: any;
  innerRef?: any;
  initialScrollOffset?: number;
  startReached?: Function;
  endReached?: Function;
  onScroll?: Function,
}

interface State {
  instance: any;
  isScrolling: boolean;
  scrollDirection: ScrollDirection;
  scrollOffset: number;
  scrollUpdateWasRequested: boolean;
}

export default class VirtuList extends PureComponent<Props, State> {

  _styleCacheMap: Map<number, Object> = new Map();
  _metaData: MetaData = {
    itemMetadataMap: {},
    estimatedItemSize: this.props.estimatedItemSize,
    firstMeasuredIndex: -1,
    lastMeasuredIndex: -1,
  };
  _outerRef?: HTMLDivElement;
  _resetIsScrollingTimeoutId: TimeoutID | null = null;
  _prevState: PrevState = {
    originalIndex: 0,
    itemCount: 0,
  }
  _range: Range = {
    startIndex: 0,
    stopIndex: 0,
  };
  // anchor item
  _anchorItem: PositionItem = {
    index: getVirtualIndex(),
    offset: 0,
  };
  // 需要定位到的项
  _targetItem: PositionItem = {
    index: getVirtualIndex(),
    offset: 0,
  };
  // flag
  _flag: Flag = {
    isInit: false, // is initial
    isAdjustScroll: false,
    disableStartReachCallback: false,
    disableEndReachCallback: false,
    followOutput: false,
  };
  _virtualIndex: VirtualIndex = {
    initialIndex: getVirtualIndex(),
    minIndex: getVirtualIndex(),
    maxIndex: getVirtualIndex(),
  }

  // default props
  static defaultProps = {
    itemData: undefined,
    overscanCount: 2,
    initialIndex: 0,
    originalIndex: 0,
    reachThreshold: 100,
    estimatedItemSize: DEFAULT_ESTIMATED_ITEM_SIZE,
  }

  state: State = {
    instance: this,
    isScrolling: false,
    scrollDirection: "forward",
    scrollOffset:
      typeof this.props.initialScrollOffset === "number"
        ? this.props.initialScrollOffset
        : 0,
    scrollUpdateWasRequested: false,
  };

  // Always use explicit constructor for React components.
  // It produces less code after transpilation. (#26)
  // eslint-disable-next-line no-useless-constructor
  constructor(props: Props) {
    super(props);
    const { initialIndex } = props;
    // 初始化时列表的第一项的虚拟下标肯定为 VIRTUAL_ORIGINAL_INDEX
    this._virtualIndex.initialIndex = getVirtualIndex(
      typeof initialIndex === 'number' ? initialIndex : 0
    )
    this._updateRangeIndex();

    this._range = this.getInitialRange();
  }

  componentDidMount() {
    const { initialIndex } = this._virtualIndex;
    const { itemMetadataMap } = this._metaData;

    // if (typeof initialScrollOffset === 'number' && this._outerRef != null) {
    //   const outRef = this._outerRef as HTMLElement;
    //   outRef.scrollTop = initialScrollOffset;
    //   console.log(this._outerRef.scrollTop)
    // }

    if (this._outerRef != null) {
      this._adjustScroll(itemMetadataMap[initialIndex].offset)
      // init anchor
      this._targetItem = {
        index: initialIndex,
        offset: 0,
      }
    }

    this._init();
  }

  componentDidUpdate() {
    const { itemCount } = this.props;

    if (itemCount !== this._prevState.itemCount) {
      // 更新虚拟的开始和结束下标
      this._updateRangeIndex();

      // 高度发生变化更新要定位到的点为锚点
      this._targetItem = { ...this._anchorItem };
      this._callLengthChangeCallbacks();
      this._prevState.itemCount = itemCount;
    }

    // update scrollTop to anchorItem
    this._scrollToTargetItem();
  }

  componentWillUnmount() {
    if (this._resetIsScrollingTimeoutId !== null) {
      cancelTimeout(this._resetIsScrollingTimeoutId);
    }
  }

  render() {
    const {
      itemCount,
      children,
      className,
      itemData,
      innerRef,
      style,
    } = this.props;
    const { isScrolling } = this.state;
    const { startIndex, stopIndex } = this._range;

    const onScroll = this._onScroll;

    this._anchorItem = this._getAnchorItem();

    const items = [];
    if (itemCount > 0) {
      for (let index = startIndex; index <= stopIndex; index++) {
        items.push(
          createElement(children, {
            data: itemData,
            key: index,
            isScrolling,
            index, 
            style: this._getItemStyle(index),
          })
        )
      }
    }

    const estimatedTotalSize = this.getEstimatedTotalSize();

    return createElement('div', {
        className,
        onScroll,
        ref: this._outerRefSetter,
        style: {
          position: 'relative',
          height: '100%',
          width: '100%',
          overflow: 'hidden overlay',
          WebkitOverflowScrolling: 'touch',
          willChange: 'transform',
          ...style,
        }
      },
      createElement('div', {
        children: items,
        ref: innerRef,
        style: {
          height: estimatedTotalSize,
          pointerEvents: isScrolling ? 'none' : undefined,
          width: '100%',
        }
      })
    );
  }

  _getItemStyle = (index: number): Object => {
    let style;
    if (this._styleCacheMap.has(index)) {
      style = this._styleCacheMap.get(index);
    } else {
      const offset = this.getItemOffset(index);
      // const size = this.getItemSize(index);

      style = {
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(0px, ${offset}px)`,
        // height: size,
        boxSizing: 'border-box',
        width: '100%',
      };

      this._styleCacheMap.set(index, style);
    }

    return style || {};
  }

  getEstimatedTotalSize(): number {
    const { itemCount, originalIndex } = this.props;
    const maxIndex = getVirtualIndex(itemCount - 1, originalIndex);
    let { itemMetadataMap, estimatedItemSize, lastMeasuredIndex } = this._metaData;
    let totalSizeOfMeasuredItems = 0;

    if (lastMeasuredIndex > maxIndex) {
      lastMeasuredIndex = maxIndex;
    }

    if (lastMeasuredIndex !== -1) {
      const itemMetadata = itemMetadataMap[lastMeasuredIndex];
      totalSizeOfMeasuredItems = itemMetadata.offset + itemMetadata.size;
    }

    const numUnmeasuredItems = maxIndex - lastMeasuredIndex;
    const totalSizeOfUnmeasuredItems = numUnmeasuredItems * estimatedItemSize;

    return totalSizeOfMeasuredItems + totalSizeOfUnmeasuredItems;
  }

  _getRangeToRender(
    scrollOffset: number,
  ): Range {
    const { itemCount } = this.props;
    const { itemMetadataMap } = this._metaData;

    if (itemCount === 0) {
      return { startIndex: 0, stopIndex: 0 };
    }

    const startIndex = this.getStartIndexForOffset(scrollOffset);
    const stopIndex = this.getStopIndexForStartIndex(startIndex, scrollOffset);

    // update anchor item
    this._targetItem = {
      index: startIndex,
      offset: scrollOffset - itemMetadataMap[startIndex].offset
    };

    return {
      startIndex: this._safeStartIndex(startIndex),
      stopIndex: this._safeStopIndex(stopIndex),
    };
  }

  getInitialRange(): Range {
    const { height } = this.props;
    const { initialIndex, maxIndex } = this._virtualIndex;
    const { estimatedItemSize } = this._metaData;
    const minNum: number = Math.ceil(height / estimatedItemSize);

    let startIndex = initialIndex;
    let stopIndex = initialIndex + minNum - 1;
    // initialIndex 后面的内容不够撑起一屏
    if (stopIndex > maxIndex) {
      startIndex -= stopIndex - maxIndex;
      stopIndex = maxIndex;
    }

    return {
      startIndex: this._safeStartIndex(startIndex),
      stopIndex: this._safeStopIndex(stopIndex),
    }
  }

  getStartIndexForOffset(
    scrollOffset: number,
  ): number {
    const { lastMeasuredIndex } = this._metaData;
    const { minIndex } = this._virtualIndex;

    const itemMetadata = this.getItemMetadata(lastMeasuredIndex);
    const lastMeasuredItemOffset =
      lastMeasuredIndex !== -1 ? itemMetadata.offset : 0;
    
    if (lastMeasuredItemOffset >= scrollOffset) {
      return this.findNearestItemBinarySearch(
        lastMeasuredIndex,
        minIndex,
        scrollOffset,
      );
    } else {
      return this.findNearestItemExponentialSearch(
        Math.max(minIndex, lastMeasuredIndex),
        scrollOffset,
      )
    }
  }

  // 定位到底部
  scrollToBottom(): void {
    const { maxIndex } = this._virtualIndex;
    this.locateToItem(maxIndex);

    // update scrollTop to anchorItem
    this._scrollToTargetItem();
  }

  locateToItem(index: number): void {
    const { height } = this.props;
    const { minIndex, maxIndex } = this._virtualIndex;
    let startIndex = index;
    let stopIndex = index;

    let sumHeight = 0;
    // 向下找到stopIndex
    while (stopIndex <= maxIndex && sumHeight < height) {
      sumHeight += this.getItemMetadata(stopIndex).size;
      stopIndex++;
    }

    // 下面的不够撑起一屏，需要向上补齐
    if (sumHeight < height) {
      startIndex--;
      while (startIndex >= minIndex && sumHeight < height) {
        sumHeight += this.getItemMetadata(startIndex).size;
        startIndex--;
      }
    }

    this._targetItem = {
      index: index,
      offset: index === maxIndex
        ? this.getItemMetadata(index).size : 0,
    };
    this._range = {
      startIndex: this._safeStartIndex(startIndex),
      stopIndex: this._safeStopIndex(stopIndex),
    };
  }

  getStopIndexForStartIndex(
    startIndex: number,
    scrollOffset: number,
  ): number {
    const { height } = this.props;
    const { maxIndex } = this._virtualIndex;

    const itemMetadata = this.getItemMetadata(startIndex);
    const maxOffset = scrollOffset + height;

    let offset = itemMetadata.offset + itemMetadata.size;
    let stopIndex = startIndex;

    while (stopIndex <= maxIndex && offset < maxOffset) {
      stopIndex++;
      offset += this.getItemMetadata(stopIndex).size;
    }

    return Math.min(stopIndex, maxIndex);
  }

  // 在这里更新lastMeasuredIndex
  getItemMetadata(
    index: number,
  ): ItemMetadata {
    const { itemSize } = this.props;
    const { minIndex } = this._virtualIndex;
    let { itemMetadataMap, lastMeasuredIndex, firstMeasuredIndex } = this._metaData;

    if (firstMeasuredIndex < 0 || index < firstMeasuredIndex) {
      lastMeasuredIndex = -1; // 重置
    }


    if (index > lastMeasuredIndex) {
      let offset = 0;
      let startIdx = lastMeasuredIndex + 1; // 默认从上一次的地方查找起
      if (lastMeasuredIndex !== -1) {
        const itemMetadata = itemMetadataMap[lastMeasuredIndex];
        offset = itemMetadata.offset + itemMetadata.size;
      } else {
        startIdx = minIndex; // 首次就从第一个项查找起
        this._metaData.firstMeasuredIndex = minIndex;
      }

      for (let i = startIdx; i <= index; i++) {
        let size = itemSize(i);

        itemMetadataMap[i] = {
          offset,
          size,
        }
        
        offset += size;
      }

      this._metaData.lastMeasuredIndex = index;
    }

    return itemMetadataMap[index];
  }

  getItemOffset(index: number): number {
    return this.getItemMetadata(index).offset;
  }

  getItemSize(index: number): number {
    const { itemMetadataMap } = this._metaData;
    return itemMetadataMap[index].size;
  }

  // 二分法查找
  findNearestItemBinarySearch(
    high: number,
    low: number,
    offset: number,
  ): number {
    const { minIndex } = this._virtualIndex;
    while (low <= high) {
      const middle = low + Math.floor((high - low) / 2);
      const itemMetadata = this.getItemMetadata(middle);
      const currentOffset = itemMetadata.offset;

      if (currentOffset === offset) {
        return middle;
      } else if (currentOffset < offset) {
        low = middle + 1;
      } else if (currentOffset > offset) {
        high = middle - 1;
      }
    }

    return low > minIndex ? low - 1 : minIndex;
  }

  // 指数查找
  findNearestItemExponentialSearch(
    index: number,
    offset: number,
  ): number {
    const { maxIndex, minIndex } = this._virtualIndex;
    let interval = 1;

    while(
      index <= maxIndex &&
      this.getItemMetadata(index).offset < offset
    ) {
      index += interval;
      interval *= 2;
    }
    const low = minIndex + Math.floor((index - minIndex) / 2);
    return this.findNearestItemBinarySearch(
      Math.min(index, maxIndex),
      low,
      offset,
    )
  }

  _scrollToTargetItem(): void {
    // const { itemMetadataMap } = this._metaData;
    // update scrollTop to anchorItem
    if (this._outerRef != null) {
      const outRef = this._outerRef as HTMLElement;
      const { index, offset } = this._targetItem;
      const itemMetadata = this.getItemMetadata(index);
      const newScrollOffset = itemMetadata.offset
          + offset;
      if (outRef.scrollTop !== newScrollOffset) {
        this._adjustScroll(newScrollOffset);
      }
    }
  }

  /**
   * scroll for adjust, without trigger update
   * @param index 
   */
  _adjustScroll = (index: number): void => {
    if (this._outerRef != null) {
      const outRef = this._outerRef as HTMLElement;
      if (outRef.scrollTop !== index) {
        this._flag.isAdjustScroll = true;
        outRef.scrollTop = index;
        this.setState({ scrollOffset: outRef.scrollTop });
      }
    }
  }

  restReachCallbacks(option?: ResetReachCbOption): void {
    if (!option) {
      this._flag.disableStartReachCallback = false;
      this._flag.disableEndReachCallback = false;
    } else {
      if (option.start) {
        this._flag.disableStartReachCallback = false;
      }
      if (option.end) {
        this._flag.disableEndReachCallback = false;
      }
    }
  }

  // 重置 index 下标后面的缓存
  resetAfterIndex = (index: number, shouldForceUpdate = true) => {
    const { originalIndex } = this.props;

    if (index <= 0) {
      this._metaData.firstMeasuredIndex = -1;
      this._metaData.lastMeasuredIndex = -1;
    } else {
      this._metaData.lastMeasuredIndex = Math.min(
        this._metaData.lastMeasuredIndex,
        getVirtualIndex(index, originalIndex) - 1
      );
    }


    this._styleCacheMap.clear();

    if (shouldForceUpdate) {
      this.forceUpdate();
    }
  };

  followOutput(): void {
    this._flag.followOutput = true;
  }

  _updateRangeIndex(): void {
    const { itemCount, originalIndex } = this.props;
    this._virtualIndex.minIndex = getVirtualIndex(0, originalIndex);
    this._virtualIndex.maxIndex = getVirtualIndex(itemCount - 1, originalIndex)
  }

  _getAnchorItem(): PositionItem {
    const { scrollOffset } = this.state;
    const { itemMetadataMap } = this._metaData;

    const { minIndex } = this._virtualIndex;
    if (scrollOffset <= 0) {
      return { index: minIndex, offset: 0 };
    }
    const index = this.getStartIndexForOffset(scrollOffset);
    return {
      index,
      offset: scrollOffset - itemMetadataMap[index].offset,
    }
  }

  _init(): void {
    const { originalIndex, itemCount } = this.props;
    this._flag.isInit = true;

    this._prevState.itemCount = itemCount;
    this._prevState.originalIndex = originalIndex;
  }

  _fillRange(): void {
    const { height } = this.props;
    const { minIndex, maxIndex } = this._virtualIndex;
    const { startIndex, stopIndex } = this._range;
    
    if (startIndex === minIndex && stopIndex === maxIndex) {
      return;
    }

    let sumHeight = 0;
    for (let i = startIndex; i < stopIndex; i++) {
      sumHeight += this.getItemMetadata(i).size;
    }

    if (sumHeight < height) {
      let startIdx = startIndex - 1;
      let stopIdx = stopIndex + 1;
      
      // 向后补齐
      while (stopIdx <= maxIndex && sumHeight < height) {
        sumHeight += this.getItemMetadata(stopIdx).size;
        stopIdx++;
      }

      // 向前补齐
      if (sumHeight < height) {
        while (startIdx >= minIndex && sumHeight < height) {
          sumHeight += this.getItemMetadata(startIdx).size;
          startIdx--;
        }
      }

      this._range = {
        startIndex: this._safeStartIndex(startIdx),
        stopIndex: this._safeStopIndex(stopIdx),
      };
    }

  }

  /**
   * 数组长度发生变化
   */
  _callLengthChangeCallbacks(): void {
    const { originalIndex } = this.props;
    const { maxIndex } = this._virtualIndex;
    if (this._flag.followOutput) {
      /**
       * 定位到底部
       * 容易出现问题，单独拿出来，与其他操作区分
       */
      this._flag.followOutput = false;
      this.locateToItem(maxIndex);
      // 强制更新一次，防止少于一屏是消息不更新
      this.resetAfterIndex(Math.max(0, this._prevState.itemCount - 1));
    } else {
      if (originalIndex > this._prevState.originalIndex) {
        // 原点变大了，说明头部增加了内容
        this.resetAfterIndex(0);
        this._prevState.originalIndex = originalIndex;
  
        this._flag.disableStartReachCallback = false;
      } else {
        // 否则说明是在尾部增加了内容
        this._flag.disableEndReachCallback = false;
      }

      // range不够一屏的时候补齐range
      this._fillRange();
    }
  }

  _onScroll = (event: HTMLElementEvent<HTMLDivElement>): void => {
    const { startReached, endReached, reachThreshold, onScroll } = this.props;

    onScroll && onScroll(event);
    const { clientHeight, scrollHeight, scrollTop } = event.target
    
    // no trigger scroll
    if (this._flag.isAdjustScroll && scrollTop > 0) {
      this._flag.isAdjustScroll = false;
      return;
    }


    this.setState(prevState => {
      if (prevState.scrollOffset === scrollTop) {
        // Scroll position may have been updated by cDM/cDU,
        // In which case we don't need to trigger another render,
        // And we don't want to update state.isScrolling.
        return null;
      }

      // Prevent Safari's elastic scrolling from causing visual shaking when scrolling past bounds.
      const scrollOffset = Math.max(
        0,
        Math.min(scrollTop, scrollHeight - clientHeight)
      );

      const scrollDirection: ScrollDirection = prevState.scrollOffset < scrollOffset
        ? 'forward' : 'backward';

      if (
        !this._flag.disableStartReachCallback
        && scrollOffset <= reachThreshold
        && scrollDirection === 'backward'
      ) {
        this._flag.disableStartReachCallback = true;
        startReached && startReached({ clientHeight, scrollHeight, scrollTop });
      }
  
      if (
        !this._flag.disableEndReachCallback
        && scrollOffset + clientHeight >= scrollHeight - reachThreshold
        && scrollDirection === 'forward'
      ) {
        this._flag.disableEndReachCallback = true;
        endReached && endReached({ clientHeight, scrollHeight, scrollTop });
      }

      this._range = this._getRangeToRender(scrollOffset);

      return {
        isScrolling: true,
        scrollDirection,
        scrollOffset,
        scrollUpdateWasRequested: false,
      };
    }, this._resetIsScrollingDebounced);
  }

  _safeStartIndex(startIndex: number): number {
    const { overscanCount } = this.props;
    const { minIndex } = this._virtualIndex;
    const overscan = Math.max(1, overscanCount);
    return Math.max(minIndex, startIndex - overscan);
  }

  _safeStopIndex(stopIndex: number): number {
    const { overscanCount } = this.props
    const { maxIndex } = this._virtualIndex;
    const overscan = Math.max(1, overscanCount);
    return Math.max(0, Math.min(maxIndex, stopIndex + overscan));
  }

  _resetIsScrollingDebounced = () => {
    if (this._resetIsScrollingTimeoutId !== null) {
      cancelTimeout(this._resetIsScrollingTimeoutId);
    }

    this._resetIsScrollingTimeoutId = requestTimeout(
      this._resetIsScrolling,
      IS_SCROLLING_DEBOUNCE_INTERVAL
    );
  };

  _resetIsScrolling = () => {
    this._resetIsScrollingTimeoutId = null;

    this.setState({ isScrolling: false }, () => {
      // Clear style cache after state update has been committed.
      // This way we don't break pure sCU for items that don't use isScrolling param.
      this._styleCacheMap.clear();
    });
  };

  _outerRefSetter = (ref: any): void => {
    const { outerRef } = this.props;

    this._outerRef = ref as HTMLDivElement;

    if (typeof outerRef === 'function') {
      outerRef(ref);
    } else if (
      outerRef != null &&
      typeof outerRef === 'object' &&
      outerRef.hasOwnProperty('current')
    ) {
      outerRef.current = ref;
    }
  };
}
