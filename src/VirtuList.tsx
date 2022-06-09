import { createElement, PureComponent } from "react";

import { cancelTimeout, TimeoutID, requestTimeout } from "./util/timer";

const DEFAULT_ESTIMATED_ITEM_SIZE = 50;
const IS_SCROLLING_DEBOUNCE_INTERVAL = 150;

type ScrollDirection = "forward" | "backward";

type itemSizeGetter = (index: number) => number;

type HTMLElementEvent<T extends HTMLElement> = Event & {
  target: T
  currentTarget: T
}

type AnchorItem = {
  index: number,
  offset: number,
}

type Range = {
  startIndex: number,
  stopIndex: number,
}

interface ItemMetadata {
  offset: number;
  size: number;
}

interface InstanceProps {
  itemMetadataMap: { [index: number]: ItemMetadata };
  estimatedItemSize: number;
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
  className?: string;
  style?: Object;
  outerRef?: any;
  innerRef?: any;
  initialScrollOffset?: number;
}

interface State {
  instance: any;
  isScrolling: boolean;
  scrollDirection: ScrollDirection;
  scrollOffset: number;
  scrollUpdateWasRequested: boolean;
}

export default class VirtuList extends PureComponent<Props, State> {
  initInstanceProps(instance: any): InstanceProps {
    const {
      props: {
        estimatedItemSize = DEFAULT_ESTIMATED_ITEM_SIZE
      } = {}
    } = instance;
    const instanceProps = {
      itemMetadataMap: {},
      estimatedItemSize: estimatedItemSize,
      lastMeasuredIndex: -1,
    };

    instance.resetAfterIndex = (index: number, shouldForceUpdate = true) => {
      instanceProps.lastMeasuredIndex = Math.min(
        instanceProps.lastMeasuredIndex,
        index - 1
      );

      instance._styleCacheMap.clear();

      if (shouldForceUpdate) {
        instance.forceUpdate();
      }
    };

    return instanceProps;
  }

  _styleCacheMap: Map<number, Object> = new Map();
  _instanceProps = this.initInstanceProps(this);
  _outerRef?: HTMLDivElement;
  _resetIsScrollingTimeoutId: TimeoutID | null = null;
  _range: Range = {
    startIndex: 0,
    stopIndex: 0,
  };
  // anchor item
  _anchorItem: AnchorItem = {
    index: 0,
    offset: 0,
  };
  // is initial
  _isInit: Boolean = false;
  _isAdjustScroll: Boolean = false;

  // default props
  static defaultProps = {
    itemData: undefined,
    overscanCount: 2,
    initialIndex: 0,
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
    this._range = this.getInitialRange();
  }

  getInitialRange(): Range {
    const { height, initialIndex, itemCount, overscanCount } = this.props;
    const { estimatedItemSize } = this._instanceProps;
    const minNum: number = Math.ceil(height / estimatedItemSize);

    let startIndex = initialIndex;
    let stopIndex = initialIndex + minNum - 1;
    // initialIndex 后面的内容不够撑起一屏
    if (stopIndex >= itemCount) {
      startIndex -= stopIndex - (itemCount - 1);
      stopIndex = itemCount - 1;
    }

    const overscan = Math.max(1, overscanCount);

    return {
      startIndex: Math.max(0, startIndex - overscan),
      stopIndex: Math.max(0, Math.min(itemCount - 1, stopIndex + overscan)),
    }
  }

  componentDidMount() {
    const { initialScrollOffset, initialIndex } = this.props;
    const { itemMetadataMap } = this._instanceProps;

    if (typeof initialScrollOffset === 'number' && this._outerRef != null) {
      const outRef = this._outerRef as HTMLElement;
      outRef.scrollTop = initialScrollOffset;
      console.log(this._outerRef.scrollTop)
    }

    if (typeof initialIndex === 'number' && this._outerRef != null) {
      this.adjustScroll(itemMetadataMap[initialIndex].offset)
      // init anchor
      this._anchorItem = {
        index: initialIndex,
        offset: 0,
      }
    }

    this._isInit = true;
    this._callPropsCallbacks();
  }

  componentDidUpdate() {
    const { scrollOffset, scrollUpdateWasRequested } = this.state;
    const { itemMetadataMap } = this._instanceProps;

    if (scrollUpdateWasRequested && this._outerRef != undefined) {
      const outRef = this._outerRef as HTMLElement;
      outRef.scrollTop = scrollOffset;
    }

    // update scrollTop to anchorItem
    if (this._outerRef != null) {
      const outRef = this._outerRef as HTMLElement;
      const newScrollOffset = itemMetadataMap[this._anchorItem.index].offset
          + this._anchorItem.offset;
      if (outRef.scrollTop !== newScrollOffset) {
        this.adjustScroll(newScrollOffset);
      }
    }
    this._callPropsCallbacks();
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
      height,
      width,
      style,
    } = this.props;
    const { isScrolling } = this.state;
    const { startIndex, stopIndex } = this._range;

    const onScroll = this._onScroll;

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
          height,
          width,
          overflow: 'auto',
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
      };

      this._styleCacheMap.set(index, style);
    }

    return style || {};
  }

  getEstimatedTotalSize(): number {
    const { itemCount } = this.props;
    let { itemMetadataMap, estimatedItemSize, lastMeasuredIndex } = this._instanceProps;
    let totalSizeOfMeasuredItems = 0;

    if (lastMeasuredIndex >= itemCount) {
      lastMeasuredIndex = itemCount - 1;
    }

    if (lastMeasuredIndex >= 0) {
      const itemMetadata = itemMetadataMap[lastMeasuredIndex];
      totalSizeOfMeasuredItems = itemMetadata.offset + itemMetadata.size;
    }

    const numUnmeasuredItems = itemCount - lastMeasuredIndex - 1;
    const totalSizeOfUnmeasuredItems = numUnmeasuredItems * estimatedItemSize;

    return totalSizeOfMeasuredItems + totalSizeOfUnmeasuredItems;
  }

  _getRangeToRender(
    scrollOffset: number,
  ): Range {
    const { itemCount, overscanCount } = this.props;
    const { itemMetadataMap } = this._instanceProps;

    if (itemCount === 0) {
      return { startIndex: 0, stopIndex: 0 };
    }

    const startIndex = this.getStartIndexForOffset(scrollOffset);
    const stopIndex = this.getStopIndexForStartIndex(startIndex, scrollOffset);

    // update anchor item
    this._anchorItem = {
      index: startIndex,
      offset: scrollOffset - itemMetadataMap[startIndex].offset
    };

    const overscan = Math.max(1, overscanCount);

    return {
      startIndex: Math.max(0, startIndex - overscan),
      stopIndex: Math.max(0, Math.min(itemCount - 1, stopIndex + overscan)),
    };
  }

  getStartIndexForOffset(
    scrollOffset: number,
  ): number {
    const { itemMetadataMap, lastMeasuredIndex } = this._instanceProps;

    const lastMeasuredItemOffset =
      lastMeasuredIndex > 0 ? itemMetadataMap[lastMeasuredIndex].offset : 0;
    
    if (lastMeasuredItemOffset >= scrollOffset) {
      return this.findNearestItemBinarySearch(
        lastMeasuredIndex,
        0,
        scrollOffset,
      );
    } else {
      return this.findNearestItemExponentialSearch(
        Math.max(0, lastMeasuredIndex),
        scrollOffset,
      )
    }
  }

  getStopIndexForStartIndex(
    startIndex: number,
    scrollOffset: number,
  ): number {
    const { height, itemCount } = this.props;

    const itemMetadata = this.getItemMetadata(startIndex);
    const maxOffset = scrollOffset + height;

    let offset = itemMetadata.offset + itemMetadata.size;
    let stopIndex = startIndex;

    while (stopIndex < itemCount - 1 && offset < maxOffset) {
      stopIndex++;
      offset += this.getItemMetadata(stopIndex).size;
    }

    return stopIndex;
  }

  // 在这里更新lastMeasuredIndex
  getItemMetadata(
    index: number,
  ): ItemMetadata {
    const { itemSize } = this.props;
    const { itemMetadataMap, lastMeasuredIndex } = this._instanceProps;

    if (index > lastMeasuredIndex) {
      let offset = 0;
      if (lastMeasuredIndex >= 0) {
        const itemMetadata = itemMetadataMap[lastMeasuredIndex];
        offset = itemMetadata.offset + itemMetadata.size;
      }

      for (let i = lastMeasuredIndex + 1; i <= index; i++) {
        let size = itemSize(i);

        itemMetadataMap[i] = {
          offset,
          size,
        }
        
        offset += size;
      }

      this._instanceProps.lastMeasuredIndex = index;
    }

    return itemMetadataMap[index];
  }

  getItemOffset(index: number): number {
    return this.getItemMetadata(index).offset;
  }

  getItemSize(index: number): number {
    const { itemMetadataMap } = this._instanceProps;
    return itemMetadataMap[index].size;
  }

  // 二分法查找
  findNearestItemBinarySearch(
    high: number,
    low: number,
    offset: number,
  ): number {
    while (low <= high) {
      const middle = low + Math.floor((high - low) / 2);
      const currentOffset = this.getItemMetadata(middle).offset;

      if (currentOffset === offset) {
        return middle;
      } else if (currentOffset < offset) {
        low = middle + 1;
      } else if (currentOffset > offset) {
        high = middle - 1;
      }
    }

    return low > 0 ? low - 1 : 0;
  }

  // 指数查找
  findNearestItemExponentialSearch(
    index: number,
    offset: number,
  ): number {
    const { itemCount } = this.props;
    let interval = 1;

    while(
      index < itemCount &&
      this.getItemMetadata(index).offset < offset
    ) {
      index += interval;
      interval *= 2;
    }

    return this.findNearestItemBinarySearch(
      Math.min(index, itemCount - 1),
      Math.floor(index / 2),
      offset,
    )
  }

  /**
   * scroll for adjust, without trigger update
   * @param index 
   */
  adjustScroll = (index: number): void => {
    if (this._outerRef != null) {
      const outRef = this._outerRef as HTMLElement;
      if (outRef.scrollTop !== index) {
        this._isAdjustScroll = true;
        outRef.scrollTop = index;
        this.setState({ scrollOffset: outRef.scrollTop });
      }
    }
  }

  _callPropsCallbacks() {

  }

  _onScroll = (event: HTMLElementEvent<HTMLDivElement>): void => {

    // no trigger scroll
    if (this._isAdjustScroll) {
      this._isAdjustScroll = false;
      return;
    }
    const { clientHeight, scrollHeight, scrollTop } = event.target
    // console.log({ clientHeight, scrollHeight, scrollTop, state: this.state })

    // if (this._isInit) {
    //   this._isInit = false;
    //   return;
    // }

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

      this._range = this._getRangeToRender(scrollOffset);

      return {
        isScrolling: true,
        scrollDirection:
          prevState.scrollOffset < scrollOffset ? 'forward' : 'backward',
        scrollOffset,
        scrollUpdateWasRequested: false,
      };
    }, this._resetIsScrollingDebounced);
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
