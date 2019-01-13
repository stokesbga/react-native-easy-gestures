import React, { Component } from "react";
import PropTypes from "prop-types";
import _ from "lodash";
import R from "ramda";

import { PanResponder, View, Platform, Dimensions } from "react-native";
const deviceHeight = Dimensions.get("window").height;
const deviceWidth = Dimensions.get("window").width;

// Utils
import { angle, distance } from "./utils/math.js";
import { getAngle, getScale, getTouches, isMultiTouch } from "./utils/events.js";

export default class Gestures extends Component {
  static propTypes = {
    children: PropTypes.element,
    // Behavior
    enableSnapToNearestBounds: PropTypes.bool,
    draggable: PropTypes.oneOfType([
      PropTypes.bool,
      PropTypes.shape({
        x: PropTypes.bool,
        y: PropTypes.bool
      })
    ]),
    rotatable: PropTypes.bool,
    scalable: PropTypes.oneOfType([
      PropTypes.bool,
      PropTypes.shape({
        min: PropTypes.number,
        max: PropTypes.number
      })
    ]),
    topZindex: PropTypes.number,
    containerPadding: PropTypes.number,
    containerLayout: PropTypes.object,
    // Styles
    styles: PropTypes.object,
    // Callbacks
    onDragOutOfBounds: PropTypes.func,
    onTouchesChange: PropTypes.func,
    onStart: PropTypes.func,
    onChange: PropTypes.func,
    onEnd: PropTypes.func,
    onMultyTouchStart: PropTypes.func,
    onMultyTouchChange: PropTypes.func,
    onMultyTouchEnd: PropTypes.func,
    onRelease: PropTypes.func, // Legacy
    onRotateStart: PropTypes.func,
    onRotateChange: PropTypes.func,
    onRotateEnd: PropTypes.func,
    onScaleStart: PropTypes.func,
    onScaleChange: PropTypes.func,
    onScaleEnd: PropTypes.func
  };

  static defaultProps = {
    children: {},
    // Behavior
    enableSnapToNearestBounds: false,
    draggable: true || {
      x: true,
      y: false
    },
    rotatable: true,
    scalable: true || {
      min: 0.33,
      max: 3
    },
    topZindex: 0,
    containerPadding: 0,
    containerLayout: {
      y: 0,
      x: 0,
      width: deviceWidth,
      height: deviceHeight
    },
    // Styles
    styles: {
      left: 0,
      top: 0,
      transform: [{ rotate: "0deg" }, { scale: 1 }]
    },
    // Callbacks
    onDragOutOfBounds: null,
    onTouchesChange: () => {},
    onStart: () => {},
    onChange: () => {},
    onEnd: () => {},
    onRelease: () => {}, // Legacy

    // New callbacks
    onMultyTouchStart: () => {},
    onMultyTouchChange: () => {},
    onMultyTouchEnd: () => {},
    onRotateStart: () => {},
    onRotateChange: () => {},
    onRotateEnd: () => {},
    onScaleStart: () => {},
    onScaleChange: () => {},
    onScaleEnd: () => {}
  };

  constructor(props) {
    super(props);

    this.state = {
      isMultyTouchingNow: false,
      isRotatingNow: false,
      isScalingNow: false,

      styles: {
        ...Gestures.defaultProps.styles,
        ...this.props.styles
      }
    };

    this.isOutOfBounds = false;
  }

  componentWillMount() {
    this.pan = PanResponder.create({
      onPanResponderGrant: this.onMoveStart,
      onPanResponderMove: this.onMove,
      onPanResponderEnd: this.onMoveEnd,
      onPanResponderRelease: this.onRelease,

      onPanResponderTerminate: () => true,
      onShouldBlockNativeResponder: () => true,
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => true,
      onMoveShouldSetPanResponderCapture: (event, { dx, dy }) => dx !== 0 && dy !== 0
    });
  }

  componentWillReceiveProps = nextProps => {
    if (
      nextProps.styles &&
      nextProps.styles.width &&
      nextProps.styles.width !== this.state.styles.width
    ) {
      this.setState({ styles: { ...this.state.styles, ...nextProps.styles } });
    }
  };

  _getNextLocation = event => {
    let {
      styles: { width, height, transform }
    } = this.state;
    const { containerLayout, containerPadding } = this.props;
    let {
      nativeEvent: { locationX, locationY, pageX, pageY }
    } = event;

    // Define reusables
    let oob = {},
      boundLeft = pageX - locationX,
      boundRight = pageX + (width - locationX),
      boundTop = pageY - locationY,
      boundBottom = pageY + (height - locationY),
      stp = { left: boundLeft - containerLayout.x, top: boundTop - containerLayout.y };

    // If out of bounds of container X axis, snap back to inside
    if (boundLeft < containerLayout.x) {
      oob.x = "min";
      oob.snapToPosition = { ...stp, left: 0 };
    } else if (boundRight > containerLayout.width + containerLayout.x) {
      oob.x = "max";
      oob.snapToPosition = { ...stp, left: containerLayout.width - width + containerPadding };
    }

    // If out of bounds of container Y axis, snap back to inside
    if (boundTop < containerLayout.y) {
      oob.y = "min";
      oob.snapToPosition = { ...stp, ...oob.snapToPosition, top: 0 };
    } else if (boundBottom > containerLayout.height + containerLayout.y) {
      oob.y = "max";
      oob.snapToPosition = {
        ...stp,
        ...oob.snapToPosition,
        top: containerLayout.height - height + containerPadding
      };
    }

    return !_.isEmpty(oob) ? oob : null;
  };

  onRelease = event => {
    if (!this.props.draggable) return;

    this.isOutOfBounds = false;
    if (this.props.onDragOutOfBounds) this.props.onDragOutOfBounds(false);

    if (this.props.enableSnapToNearestBounds) {
      let oob = this._getNextLocation(event);
      if (!oob) return;

      this.dragStyles = {
        ...this.dragStyles,
        ...oob.snapToPosition
      };

      // Update styles to move element if anything was out of bounds
      this.updateStyles();
    }
    return;
  };

  onDrag = (event, gestureState) => {
    const { initialStyles } = this;
    const { draggable, topZindex } = this.props;
    const isObject = R.is(Object, draggable);

    const left = (isObject
    ? draggable.x
    : draggable)
      ? initialStyles.left + gestureState.dx
      : initialStyles.left;

    const top = (isObject
    ? draggable.y
    : draggable)
      ? initialStyles.top + gestureState.dy
      : initialStyles.top;

    let dragStyles = { left, top, zIndex: topZindex },
      oob = this._getNextLocation(event);

    if (draggable) {
      if (this.isOutOfBounds && !oob && this.props.onDragOutOfBounds) {
        this.isOutOfBounds = false;
        this.props.onDragOutOfBounds(false);
      } else if (!this.isOutOfBounds && !!oob && this.props.onDragOutOfBounds) {
        this.isOutOfBounds = true;
        this.props.onDragOutOfBounds(true);
      }
    }

    dragStyles = {
      ...dragStyles
    };
    this.dragStyles = dragStyles;
  };

  onRotate = event => {
    const { onRotateStart, onRotateChange, rotatable } = this.props;
    const { isRotatingNow, styles } = this.state;

    const { initialTouches } = this;

    if (rotatable) {
      const currentAngle = angle(getTouches(event));
      const initialAngle = initialTouches.length > 1 ? angle(initialTouches) : currentAngle;
      const newAngle = currentAngle - initialAngle;
      const diffAngle = this.prevAngle - newAngle;

      this.pinchStyles.transform.push({
        rotate: getAngle(event, styles, diffAngle)
      });

      this.prevAngle = newAngle;

      if (!isRotatingNow) {
        onRotateStart(event, styles);

        this.setState({ isRotatingNow: true });
      } else {
        onRotateChange(event, styles);
      }
    }
  };

  onScale = event => {
    const { onScaleStart, onScaleChange, scalable } = this.props;
    const { isScalingNow, styles } = this.state;
    const { initialTouches } = this;

    const isObject = R.is(Object, scalable);

    if (isObject || scalable) {
      const currentDistance = distance(getTouches(event));
      const initialDistance = distance(initialTouches);
      const increasedDistance = currentDistance - initialDistance;
      const diffDistance = this.prevDistance - increasedDistance;

      const min = isObject ? scalable.min : 0.33;
      const max = isObject ? scalable.max : 2;
      const scale = Math.min(Math.max(getScale(event, styles, diffDistance), min), max);

      this.pinchStyles.transform.push({ scale });
      this.prevDistance = increasedDistance;

      if (!isScalingNow) {
        onScaleStart(event, styles);

        this.setState({ isScalingNow: true });
      } else {
        onScaleChange(event, styles);
      }
    }
  };

  onMoveStart = event => {
    if (!this.props.draggable) return;
    const { styles } = this.state;
    const { onMultyTouchStart, onStart } = this.props;

    this.prevAngle = 0;
    this.prevDistance = 0;
    this.initialTouchesAngle = 0;
    this.pinchStyles = {};
    this.dragStyles = {};

    this.initialTouches = getTouches(event);
    this.initialStyles = styles;

    onStart(event, styles);

    if (this.initialTouches && this.initialTouches.length) {
      this.props.onTouchesChange(this.initialTouches.length);
      if (this.initialTouches.length > 1) {
        onMultyTouchStart(event, styles);
        this.setState({ isMultyTouchingNow: true });
      }
    } else {
      this.props.onTouchesChange(1);
    }
  };

  onMove = (event, gestureState) => {
    const { isMultyTouchingNow, styles } = this.state;
    const { onChange, onMultyTouchChange } = this.props;

    if (!this.props.draggable) return;

    const { initialTouches } = this;

    const touches = getTouches(event);
    if (touches) {
      if (!initialTouches || (touches.length && touches.length !== initialTouches.length)) {
        this.initialTouches = touches;
        this.props.onTouchesChange(touches.length);
      } else {
        this.onDrag(event, gestureState);
        this.onPinch(event);
      }
    }
    if (isMultyTouchingNow) {
      onMultyTouchChange(event, styles);
    }

    this.updateStyles();

    onChange(event, styles);
  };

  onMoveEnd = event => {
    const { isMultyTouchingNow, isRotatingNow, isScalingNow, styles } = this.state;
    const {
      onEnd,
      onMultyTouchEnd,
      onRelease, // Legacy
      onRotateEnd,
      onScaleEnd
    } = this.props;

    if (!this.props.draggable) return;

    onEnd(event, styles);
    onRelease(event, styles); // Legacy

    if (isRotatingNow) {
      onRotateEnd(event, styles);
    }

    if (isScalingNow) {
      onScaleEnd(event, styles);
    }

    if (isMultyTouchingNow) {
      onMultyTouchEnd(event, styles);
    }

    this.setState({
      isRotatingNow: false,
      isScalingNow: false
    });
  };

  onPinch = event => {
    if (isMultiTouch(event)) {
      this.pinchStyles = { transform: [] };

      this.onScale(event);
      this.onRotate(event);
    }
  };

  updateStyles = () => {
    const styles = {
      ...this.state.styles,
      ...this.dragStyles,
      ...this.pinchStyles
    };

    this.updateNativeStyles(styles);
    this.setState({ styles });
  };

  updateNativeStyles = styles => {
    this.view.setNativeProps({ styles });
  };

  render() {
    const { styles } = this.state;

    return (
      <View
        ref={c => {
          this.view = c;
        }}
        style={styles}
        {...this.pan.panHandlers}>
        {this.props.children}
      </View>
    );
  }
}
