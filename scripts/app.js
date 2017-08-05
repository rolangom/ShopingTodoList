/**
 * Created by rolangom on 6/19/17.
 */

// imports
const { observable, autorun } = mobx;
const { observer, Provider, inject } = mobxReact;
const { BrowserRouter, Route, Link } = ReactRouterDOM;

const stores = {};

stores.funcs = {};
stores.funcs.newItem = () => ({
  index: -1,
  qty: 0,
  text: '',
  price: 0,
  isDone: false,
});

stores.item = observable({
  item: stores.funcs.newItem(),

  get isNew() { return this.item.index < 0; },
  get isValid() { return this.item.qty > 0 && this.item.text.length > 2 && this.item.price > 0; },

  init(idx) {
    this.item = stores.itemList.item.items[idx];
    this.item.index = idx;
  },
  onChangeEv(name, value) {
    console.log(name, value);
    this.item[name] = value;
  },
  onChange(ev) {
    this.onChangeEv(ev.target.name, ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value);
  },
  onImageComplete(text, price) {
    console.log('text, price', text, price);
    this.item.text = text || this.item.text;
    this.item.price = price || this.item.price;
  },
  reset() {
    this.item = stores.funcs.newItem();
    return Promise.resolve();
  },
  save() {
    console.log('save this.item', this.item);
    return (this.item.index >= 0 ?
        stores.itemList.editItem(this.item.index, this.item) :
        stores.itemList.addItem(this.item))
      .then(() => this.reset());
  },
  loadFromImageView() {
    stores.ocrStore.onComplete = (t, p) => this.onImageComplete(t, p);
    return Promise.resolve();
  },
});

stores.funcs.saveLocalDB = ([[ k1, v1 ], [ k2, v2 ]]) =>
  Promise.all([localforage.setItem(k1, v1), localforage.setItem(k2, v2)]);
stores.funcs.getFromLocalDB = ([ k1, k2 ]) =>
  Promise.all([localforage.getItem(k1), localforage.getItem(k2)]);

stores.funcs.localSave = () =>
  stores.funcs.saveLocalDB([['item', mobx.toJS(stores.itemList.item)], ['config', mobx.toJS(stores.config.data)]]);

stores.funcs.localGet = () =>
  stores.funcs.getFromLocalDB(['item', 'config'])
    .then(([ item, config ]) => {
      console.log('item, config', item, config);
      stores.itemList.item = item || stores.itemList.item;
      stores.config.data = config || stores.config.data;
    });


stores.funcs.newItemList = () => ({
  id: -1,
  name: '',
  items: [],
  includeTaxes: true,
  createdAt: new Date(),
});

stores.itemList = observable({
  item: stores.funcs.newItemList(),
  isLoading: false,

  init() {
    console.log('stores.itemList init', this.item);
    this.isLoading = true;
    return stores.funcs.localGet()
      .then(() => this.isLoading = false)
      .catch(err => {
        this.isLoading = false;
        console.log('stores.itemList init err', err);
      });
  },

  reset() {
    this.item = stores.funcs.newItemList();
    return localforage.removeItem('item')
      .then(() => this.isLoading = false)
      .catch(err => this.isLoading = false);
  },
  save() {
    this.isLoading = true;
    return stores.funcs.localSave()
      .then(() => this.isLoading = false)
      .catch(err => this.isLoading = false);
  },

  get isNew() { return this.item.id === -1; },
  get taxFactor() { return stores.config.data.taxFactor || 0; },
  get taxFactorStr() { return `${this.taxFactor} %`; },
  get currency () { return stores.config.data.currency; },

  get subTotal() { return this.item.items.filter(it => it.isDone).reduce((acc, it) => (it.price * it.qty) + acc, 0); },
  get subTotalStr() { return `${stores.config.data.currency} ${this.subTotal.toFixed(2)}`; },

  get subTotalExpected() { return this.item.items.reduce((acc, it) => (it.price * it.qty) + acc, 0); },
  get subTotalExpectedStr() { return `${stores.config.data.currency} ${this.subTotalExpected.toFixed(2)}`; },

  get taxes() { return this.item.includeTaxes ? this.subTotal * this.taxFactor / 100 : 0; },
  get taxesExpected() { return this.item.includeTaxes ? this.subTotalExpected * this.taxFactor / 100 : 0; },

  get taxesStr() { return `${this.currency} ${this.taxes.toFixed(2)}`; },
  get taxesExpectedStr() { return `${this.currency} ${this.taxesExpected.toFixed(2)}`; },

  get total() { return this.subTotal + this.taxes; },
  get totalExpected() { return this.subTotalExpected + this.taxesExpected; },

  get totalStr() { return `${stores.config.data.currency} ${this.total.toFixed(2)}`},
  get totalExpectedStr() { return `${stores.config.data.currency} ${this.totalExpected.toFixed(2)}`},

  setName(name) {
    this.item.name = name;
  },
  setIncludeTax(is) {
    this.item.includeTaxes = is;
  },
  setDone(isDone) {
    console.log('setDone', isDone);
    this.item.items.forEach(it => it.isDone = isDone);
  },
  editView(idx) {
    console.log('editView index', idx);
    stores.item.init(idx);
    return Promise.resolve();
  },
  addView() {
    return stores.item.reset();
  },
  addItem(item) {
    console.log('addItem(item)', item);
    this.item.items.push(item);
    return this.save();
  },
  editItem(i, item) {
    console.log('editItem(i, item)', i, item);
    this.item.items[i] = item;
    return Promise.resolve();
  },
  removeItem(i) {
    this.item.items.splice(i, 1);
  },
  setItemDone(i, isDone) {
    console.log('setItemDone: i, isDone', i, isDone);
    this.item.items[i].isDone = isDone;
  },
});

autorun(() => console.log('stores.itemList.item', stores.itemList.item));

const ocrSteps = {
  CAPTURE_IMAGE: 0,
  CONFIRM_TEXTS: 1,
  CONFIRM_PRICE: 3,
  CONFIRM_SUMMA: 4,
};

const getVisibleStyle = (visible) => ({ display: visible ? 'block' : 'none'});

const ocrStatus = {
  getCaptureImageStyle: (s) => getVisibleStyle(s === ocrSteps.CAPTURE_IMAGE),
  getConfirmImageStyle: (s) => getVisibleStyle(s === ocrSteps.CONFIRM_TEXTS),
  getConfirmPriceStyle: (s) => getVisibleStyle(s === ocrSteps.CONFIRM_PRICE),
  getConfirmSummaStyle: (s) => getVisibleStyle(s === ocrSteps.CONFIRM_SUMMA),
};

const getNumberFromStr = (s) => s.replace(/[^\d\.]*/g, '');
const formatAsCurrency = (p) => `${stores.config.data.currency} ${Number(p).toFixed(2)}`;

const getDefaultOCRStatus = () => ({
  step: ocrSteps.CAPTURE_IMAGE,
  text: '',
  swords: [],
  twords: [],
  tprices: [],
  isImageSelected: false,
  isDetectingText: false,
});

stores.ocrStore = observable({
  data: getDefaultOCRStatus(),
  onComplete: null,

  get step() { return this.data.step; },
  get detectedText() { return this.data.text; },
  get isImageSelected() { return this.data.isImageSelected; },
  get isDetectingText() { return this.data.isDetectingText; },
  get _isCompleteValid() { return this.data.swords.length > 0 || this.data.tprices.length > 0; },
  get _selectedText() { return this.data.swords.map(w => w.text).join(" "); },
  get _selectedPrice() { return parseFloat(this.data.tprices.map(w => getNumberFromStr(w.text)).join("")); },
  get _processBtnText() { return this.data.isDetectingText ? "Detecting Text..." : "Detect"; },

  _reset() {
    this.data = getDefaultOCRStatus();
    return Promise.resolve();
  },
  _handleResult(result) {
    console.log('', result);
    this.data.twords = result.words.filter(w => /^[a-zA-Z0-9_.-]*$/.test(w.text)).map(w => w.text);
    this.data.text = result.text;
    this.data.step = ocrSteps.CONFIRM_TEXTS;
  },
  _setImageSelected(is) {
    this.data.isImageSelected = is;
  },
  _setDetectingText(is) {
    this.data.isDetectingText = is;
  },

  selectItem(target, index) {
    const [ text ] = this.data.twords.splice(index, 1);
    target.push({ text, index });
  },
  unSelectItem(target, word, i){
    this.data.twords.splice(word.index, 0, word.text);
    target.splice(i, 1);
  },
});

stores.config = observable({
  data: { currency: '$', taxFactor: 0 },

  onChangeEv(name, value) {
    console.log(name, value);
    this.data[name] = value;
  },
  onChange(ev) {
    this.onChangeEv(ev.target.name, ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value);
  },
});

const Config = inject('config')(observer(({ config }) => (
  <div>
    <h2>Configuration</h2>
    <div>
      <label>Currency</label>
      <input name="currency" type="text" maxLength={4} size={4} value={config.data.currency} onChange={e => config.onChange(e)} />
    </div>
    <div>
      <label>Tax</label>
      <input name="taxFactor" type="number" maxLength={4} size={4} value={config.data.taxFactor} onChange={e => config.onChange(e)} />%
    </div>
  </div>
)));

const scaleDown = (availableWidth, availableHeight, contentWidth, contentHeight) =>
  Math.min(availableWidth / contentWidth, availableHeight / contentHeight);


const DetectedTextSelector = observer(({ title, origin, target, selectItem, unSelectItem, selectedText, style, onBack, onNext }) => (
  <div style={style}>
    <h2>{title}</h2>
    <p>Click or tap in order to add text as selected.</p>
      {origin.map((w, i) =>
        <button key={i} onClick={() => selectItem(i)}>{w}</button>
      )}
    <h3>Selected texts</h3>
    <p>Click or tap to undo the text</p>
    <p>
      {target.map((w, i) => 
        <button key={i} onClick={() => unSelectItem(w, i)}>{w.text}</button>
      )}
    </p>
    <p>{selectedText}</p>
    <div>
      <button onClick={() => onBack()}>Back</button>
      <button onClick={() => onNext()}>Next</button>
    </div>
  </div>
));


const TextDetectorSummary = ({ selectedText, selectedPrice, onNext, onBack, completeDisabled, style }) => (
  <div style={style}>
    <h3>Summary</h3>
    <h3>Selected Text</h3>
    <p>{selectedText}</p>
    <h3>Selected Price</h3>
    <p>{selectedPrice}</p>
    <div>
      <button onClick={() => onBack()}>Back</button>
      <button disabled={completeDisabled} onClick={() => onNext()}>Complete</button>
    </div>
  </div>
);

const ImageTextDetector = inject('ocrStore')(observer(class extends React.Component {

  componentWillMount() {
    const { ocrStore } = this.props;
    ocrStore._reset();
  }

  _processFile = () => {
    console.log('OCR Test');
    this._processImg(this.img);
  };

  _onChangeFile = (ev) => {
    const { ocrStore } = this.props;
    console.log('this.fileImg.files', this.fileImg.files, ev);
    const file = this.fileImg.files[0];
    if (file) {
      ocrStore._setImageSelected(true);
      const reader = new FileReader();
      reader.onload = ((img) => ((e) => {
        img.onload = () => {
          const scale = scaleDown(400, 400, img.width, img.height);
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          // Scale and draw the source image to the canvas
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          img.src = canvas.toDataURL();
        };
        img.src = e.target.result;
      }))(this.img);
      reader.readAsDataURL(file);
    }
  };

  _handleError(err) {
    const { ocrStore } = this.props;
    console.error(err);
    alert(err.message);
    ocrStore._reset();
  }

  _processImg(img) {
    const { ocrStore } = this.props;
    ocrStore._setDetectingText(true);
    Tesseract.recognize(img)
      .progress(message => console.log(message))
      .catch(err => this._handleError(err))
      .then(result => ocrStore._handleResult(result))
      .finally(resultOrError => ocrStore._setDetectingText(false));
  }

  goSimpleConfirmText() {
    const { ocrStore } = this.props;
    ocrStore.data.step = ocrSteps.CONFIRM_TEXTS;
  }

  goConfirmPrice() {
    const { ocrStore } = this.props;
    ocrStore.data.step = ocrSteps.CONFIRM_PRICE;
  }

  goConfirmSummary() {
    const { ocrStore } = this.props;
    ocrStore.data.step = ocrSteps.CONFIRM_SUMMA;
  }

  _complete() {
    const { ocrStore } = this.props;
    console.log(ocrStore.data, ocrStore.onComplete);
    if (ocrStore.onComplete) {
      ocrStore.onComplete(ocrStore._selectedText, ocrStore._selectedPrice);
    }
    return Promise.resolve();
  };

  render() {
    const { ocrStore, history } = this.props;
    return (
      <div>
        <h2>OCR Test</h2>
        <div style={ocrStatus.getCaptureImageStyle(ocrStore.step)}>
          <img onClick={() => this.fileImg.click()} src="img/no-image.jpg" ref={ref => this.img = ref} /> <br />
          <input style={{display: 'none'}} type="file" accept="image/*" capture="camera" ref={ref => this.fileImg = ref} onChange={this._onChangeFile} /> <br />
          <button disabled={!ocrStore.isImageSelected || ocrStore.isDetectingText} onClick={this._processFile}>{ocrStore._processBtnText}</button>
        </div>
        <DetectedTextSelector
          style={ocrStatus.getConfirmImageStyle(ocrStore.step)}
          title="Select Words"
          origin={ocrStore.data.twords}
          target={ocrStore.data.swords}
          selectItem={i => ocrStore.selectItem(ocrStore.data.swords, i)}
          unSelectItem={(w, i) => ocrStore.unSelectItem(ocrStore.data.swords, w, i)}
          selectedText={ocrStore._selectedText}
          onNext={() => this.goConfirmPrice()}
          onBak={() => this._reset()}
        />
        <DetectedTextSelector
          style={ocrStatus.getConfirmPriceStyle(ocrStore.step)}
          title="Select Price"
          origin={ocrStore.data.twords}
          target={ocrStore.data.tprices}
          selectItem={i => ocrStore.selectItem(ocrStore.data.tprices, i)}
          unSelectItem={(w, i) => ocrStore.unSelectItem(ocrStore.data.tprices, w, i)}
          selectedText={ocrStore._selectedPrice}
          onNext={() => this.goConfirmSummary()}
          onBack={() => this.goSimpleConfirmText()}
        />
        <TextDetectorSummary
          style={ocrStatus.getConfirmSummaStyle(ocrStore.step)}
          selectedText={ocrStore._selectedText}
          selectedPrice={ocrStore._selectedPrice}
          onBack={() => this.goConfirmPrice()}
          onNext={() => this._complete().then(() => history.goBack())}
          disabled={!ocrStore._isCompleteValid}
        />

        <button onClick={() => ocrStore._reset().then(() => history.goBack())}>Cancel</button>
      </div>
    );
  }
}));


const NewItem = inject(stores => ({ store: stores.item }))(observer(({ store, history, match }) => (
  <div>
    <h2>{store.isNew ? 'New' : 'Edit'} Item</h2>
    <button onClick={() => store.loadFromImageView().then(() => history.push('/image'))}>Load from Image</button>
    <div>
      <input type="text" placeholder="Text" name="text" value={store.item.text} onChange={e => store.onChange(e)} />
    </div>
    <div>
      <input type="number" placeholder="Qty." name="qty" value={store.item.qty} onChange={e => store.onChange(e)} />
    </div>
    <div>
      <input type="number" placeholder="Price" name="price" value={store.item.price} onChange={e => store.onChange(e)} />
    </div>
    <div>
      <label>
        <input type="checkbox" name="isDone" defaultChecked={store.item.isDone} onChange={e => store.onChange(e)} />
        Is done
      </label>
    </div>
    <button disabled={!store.isValid} onClick={() => store.save().then(() => history.goBack())}>Save</button>
    <button onClick={() => store.reset().then(() => history.goBack())}>Cancel</button>
  </div>
)));

const ItemListRow = observer(({ index, item, setDone, edit, remove }) => (
  <tr>
    <td>
      <input type="checkbox" checked={item.isDone} onChange={ev => setDone(ev.target.checked)} />
    </td>
    <td>{item.qty}</td>
    <td>{item.text}</td>
    <td>{formatAsCurrency(item.price)}</td>
    <td>{formatAsCurrency(item.price * item.qty)}</td>
    <td><button onClick={() => edit()}>Edit</button></td>
    <td><button onClick={() => remove()}>x</button></td>
  </tr>
));

const ItemListHeader = observer(({ store }) => (
  <div>
    <h2>Item List</h2>
    <p>
      <textarea name="name" value={store.item.name} onChange={e => store.setName(e.target.value)} placeholder="name" />
      <button disabled={store.isLoading} onClick={() => store.save()}>Save</button>
      <button disabled={store.isLoading} onClick={() => store.reset()}>Reset</button>
      <br />
      <label>
        <input type="checkbox" checked={store.item.includeTaxes} onChange={ev => store.setIncludeTax(ev.target.checked)} />
        Include Taxes?
      </label>
      <br />
      <label>Created at {store.item.createdAt.toString()}</label>
    </p>
  </div>
));

const ItemListFooter = observer(({ store }) => (
  <tfoot>
    <Stat title="Sub-Total" value={store.subTotalStr} />
    <Stat title="Sub-Total Exp." value={store.subTotalExpectedStr} />
    {store.item.includeTaxes &&  <Stat title={`Taxes ${store.taxFactorStr}`} value={store.taxesStr} />}
    {store.item.includeTaxes &&  <Stat title={`Taxes Exp. ${store.taxFactorStr}`} value={store.taxesExpectedStr} />}
    <Stat title="Total" value={store.totalStr} />
    <Stat title="Total Exp." value={store.totalExpectedStr} />
  </tfoot>
));

const ItemList = inject(stores => ({ store: stores.itemList }))(observer(({ store, history, match }) => (
  <div>
    <ItemListHeader store={store} />
    <table>
      <thead>
        <tr>
          <th>
            <input type="checkbox" onChange={ev => store.setDone(ev.target.checked)} />
          </th>
          <th>Qty.</th>
          <th>Text</th>
          <th>Price</th>
          <th>Total</th>
          <th><button onClick={() => store.addView().then(() => history.push(`/items/new`))}>+</button></th>
        </tr>
      </thead>
      <tbody>
      {store.item.items.map((it, i) => (
        <ItemListRow
          key={i} index={i} item={it}
          edit={() => store.editView(i).then(() => history.push(`/items/${i}`))}
          setDone={done => store.setItemDone(i, done)}
          remove={() => store.removeItem(i)}
        />
      ))}
      </tbody>
      <ItemListFooter store={store} />
    </table>
  </div>
)));

const Stat = ({ title, value }) => (
  <tr>
    <td colSpan={4}>{title}</td>
    <td>{value}</td>
  </tr>
);

class Main extends React.Component {
  componentWillMount() {
    this.props.itemList.init();
  }
  render () {
    const { ...stores } = this.props;
    return (
      <Provider {...stores}>
        <BrowserRouter >
          <div>
            <div>
              <h1>Shopping TO-DO List</h1>
              <Link to="/">List</Link> -
              <Link to="/config">Config</Link>
            </div>

            <hr/>

            <Route exact path="/" component={ItemList} />
            <Route exact path="/config" component={Config} />
            <Route path="/items/:id" component={NewItem} />
            <Route path="/image" component={ImageTextDetector} />
          </div>
        </BrowserRouter>
      </Provider>
    );
  }
}

ReactDOM.render(
  <Main {...stores} />,
  document.getElementById('root')
);
