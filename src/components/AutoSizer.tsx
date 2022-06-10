import React, { PureComponent } from "react";
import ResizeObserver from 'resize-observer-polyfill';

type State = {
  height: number;
  width: number;
};

type Props = {
  children: any;
  style?: Object;
  className?: string;
};

export class AutoSizer extends PureComponent<Props, State> {
  _autoSizer: HTMLDivElement | null = null;
  _ro: any;

  static defaultProps = {
    style: {}
  };

  state: State = {
    height: 0,
    width: 0,
  };

  componentDidMount() {
    this._ro = new ResizeObserver(() => {
      this.setState({
        height: this._autoSizer?.clientHeight || 0,
        width: this._autoSizer?.clientWidth || 0,
      })
    });

    if (this._autoSizer) {
      this._ro.observe(this._autoSizer);
    }
  }

  componentWillUnmount() {
    if (this._ro && this._autoSizer) {
      this._ro.unobserve(this._autoSizer)
    }
  }

  render() {
    const { children, className, style } = this.props;
    const { height, width } = this.state;
    return (
      <div
        className={className}
        style={style}
        ref={this._setRef}
      >
        { children({ height, width }) }
      </div>
    );
  }

  _setRef = (element: HTMLDivElement) => {
    this._autoSizer = element;
  }
}
