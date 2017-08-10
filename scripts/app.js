/**
 * Created by rolangom on 6/19/17.
 */

// imports
const { observable, autorun } = mobx;
const { observer, Provider, inject } = mobxReact;
const { BrowserRouter, Route, Link } = ReactRouterDOM;
const { Menu, Input, Checkbox, Table, Statistic, Header, Label, Icon, Grid, Button, Segment, Divider, Container } = semanticUIReact;

const HOME_PATH = '/ShoppingTodoList';

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
  get _selectedPrice() { return parseFloat(this.data.tprices.map(w => getNumberFromStr(w.text)).join("")) || '-'; },
  get _processBtnText() { return this.data.isDetectingText ? "Detecting Text..." : "Detect"; },
  get currency() { return stores.config.data.currency; },

  _reset() {
    console.log('ocrStore reset');
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

const Config = inject('config')(observer(({ config, history }) => (
  <Container text>
    <Segment textAlign="center" padded>
      <h2>Configuration</h2>
      <div>
        <Input fluid label="Currency" size='huge' name="currency" type="text" maxLength={4} value={config.data.currency} onChange={e => config.onChange(e)} />
      </div>
      <div>
        <Input fluid labelPosition='right' size='huge' name="taxFactor" type="number" maxLength={4} value={config.data.taxFactor} onChange={e => config.onChange(e)} >
          <Label>Tax</Label>
          <input />
          <Label>
            <Icon name="percent" />
          </Label>
        </Input>
      </div>
    </Segment>
  </Container>
)));

const scaleDown = (availableWidth, availableHeight, contentWidth, contentHeight) =>
  Math.min(availableWidth / contentWidth, availableHeight / contentHeight);


const DetectedTextSelector = observer(({ title, origin, target, selectItem, unSelectItem, selectedText, style, onBack, onNext }) => (
  <Segment padded textAlign='center' style={style}>
    <h2>{title}</h2>
    <p>Click or tap in order to add text as selected.</p>
      {origin.map((w, i) =>
        <Button
          key={i}
          onClick={() => selectItem(i)}
          icon="add"
          content={w}
          labelPosition="left"
          primary
        />
      )}
    <Divider section />
    <h3>Selected texts</h3>
    <p>Click or tap to undo the text</p>
    <p>
      {target.map((w, i) =>
        <Button
          key={i}
          onClick={() => unSelectItem(w, i)}
          icon="minus"
          content={w.text}
          labelPosition="left"
          secondary
        />
      )}
    </p>
    <Label size="big">{selectedText}</Label>
    <Divider section />
    <Button.Group>
      <Button
        icon="arrow left"
        secondary
        content="Back"
        labelPosition="left"
        onClick={onBack}
      />
      <Button
        icon="arrow right"
        primary
        content="Next"
        labelPosition="right"
        onClick={onNext}
      />
    </Button.Group>
  </Segment>
));


const TextDetectorSummary = ({ selectedText, selectedPrice, currency, onNext, onBack, completeDisabled, style }) => (
  <Segment padded textAlign='center' style={style}>
    <h3>Summary</h3>
    <h3>Selected Text</h3>
    <p>{selectedText}</p>
    <Divider section />
    <h3>Selected Price</h3>
    <Label circular color="green" size="big">{currency}{selectedPrice || '-'}</Label>
    <Divider />
    <Button.Group>
      <Button
        icon="arrow left"
        secondary
        content="Back"
        labelPosition="left"
        onClick={onBack}
      />
      <Button
        icon="checkmark"
        positive
        content="Complete"
        disabled={completeDisabled}
        labelPosition="right"
        onClick={onNext}
      />
    </Button.Group>
  </Segment>
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

  goCaptureImg = () => {
    const { ocrStore } = this.props;
    ocrStore.data.step = ocrSteps.CAPTURE_IMAGE;
  };

  goSimpleConfirmText = () => {
    const { ocrStore } = this.props;
    ocrStore.data.step = ocrSteps.CONFIRM_TEXTS;
  };

  goConfirmPrice = () => {
    const { ocrStore } = this.props;
    ocrStore.data.step = ocrSteps.CONFIRM_PRICE;
  };

  goConfirmSummary = () => {
    const { ocrStore } = this.props;
    ocrStore.data.step = ocrSteps.CONFIRM_SUMMA;
  };

  _complete = () => {
    const { ocrStore, history } = this.props;
    console.log(ocrStore.data, ocrStore.onComplete);
    return Promise.resolve()
      .then(() => ocrStore.onComplete && ocrStore.onComplete(ocrStore._selectedText, ocrStore._selectedPrice))
      .then(() => history.goBack());
  };

  _onCancelPress = () => {
    const { ocrStore, history } = this.props;
    ocrStore._reset().then(() => history.goBack())
  };

  render() {
    const { ocrStore, history } = this.props;
    return (
      <Container text>
        <h2>OCR Detector</h2>
        <Segment padded textAlign='center' style={ocrStatus.getCaptureImageStyle(ocrStore.step)}>
          <p>Click on the on the image to load a new one.</p>
          <img onClick={() => this.fileImg.click()} src={`${HOME_PATH}/img/no-image.jpg`} ref={ref => this.img = ref} /> <br />
          <input style={{ display: 'none' }} type="file" accept="image/*" capture="camera" ref={ref => this.fileImg = ref} onChange={this._onChangeFile} /> <br />
          <Button.Group>
            <Button
              icon="arrow left"
              secondary
              content="Cancel"
              labelPosition="left"
              onClick={this._onCancelPress}
            />
            <Button
              icon="unhide"
              primary
              content={ocrStore._processBtnText}
              disabled={!ocrStore.isImageSelected || ocrStore.isDetectingText}
              labelPosition="right"
              onClick={this._processFile}
            />
          </Button.Group>
        </Segment>
        <DetectedTextSelector
          style={ocrStatus.getConfirmImageStyle(ocrStore.step)}
          title="Select Words"
          origin={ocrStore.data.twords}
          target={ocrStore.data.swords}
          selectItem={i => ocrStore.selectItem(ocrStore.data.swords, i)}
          unSelectItem={(w, i) => ocrStore.unSelectItem(ocrStore.data.swords, w, i)}
          selectedText={ocrStore._selectedText}
          onNext={this.goConfirmPrice}
          onBack={this.goCaptureImg}
        />
        <DetectedTextSelector
          style={ocrStatus.getConfirmPriceStyle(ocrStore.step)}
          title="Select Price"
          origin={ocrStore.data.twords}
          target={ocrStore.data.tprices}
          selectItem={i => ocrStore.selectItem(ocrStore.data.tprices, i)}
          unSelectItem={(w, i) => ocrStore.unSelectItem(ocrStore.data.tprices, w, i)}
          selectedText={ocrStore._selectedPrice}
          onNext={this.goConfirmSummary}
          onBack={this.goSimpleConfirmText}
        />
        <TextDetectorSummary
          style={ocrStatus.getConfirmSummaStyle(ocrStore.step)}
          selectedText={ocrStore._selectedText}
          selectedPrice={ocrStore._selectedPrice}
          currency={ocrStore.currency}
          onBack={this.goConfirmPrice}
          onNext={this._complete}
          disabled={!ocrStore._isCompleteValid}
        />
      </Container>
    );
  }
}));


const NewItem = inject(stores => ({ store: stores.item }))(observer(({ store, history, match }) => (
  <Container text>
    <Segment padded>
      <h2>{store.isNew ? 'New' : 'Edit'} Item</h2>
      <Divider />
      <Button
        icon="camera"
        content="Load from Image"
        basic
        color='blue'
        onClick={() => store.loadFromImageView().then(() => history.push(`${HOME_PATH}/image`))}
      />
      <Divider />
      <div>
        <Input fluid type="text" label="Text" name="text" size="large" value={store.item.text} onChange={e => store.onChange(e)} />
      </div>
      <div>
        <Input fluid type="number" label="Qty." name="qty" size="large" value={store.item.qty} onChange={e => store.onChange(e)} />
      </div>
      <div>
        <Input fluid type="number" label="Price" name="price" size="large" value={store.item.price} onChange={e => store.onChange(e)} />
      </div>
      <Divider hidden />
      <div>
        <Checkbox label="Is Done?"  name="isDone" size="large" defaultChecked={store.item.isDone} onChange={(e, data) => store.onChangeEv('isDone', data.checked)} />
      </div>
      <Divider />
      <Button.Group>

        <Button
          icon="arrow left"
          size="large"
          secondary
          content="Cancel"
          labelPosition="left"
          onClick={() => store.reset().then(() => history.goBack())}
        />
        <Button
          icon="checkmark"
          positive
          size="large"
          content="Save"
          disabled={!store.isValid}
          labelPosition="right"
          onClick={() => store.save().then(() => history.goBack())}
        />
      </Button.Group>
    </Segment>
  </Container>
)));

const ItemListRow = observer(({ index, item, setDone, edit, remove }) => (
  <Table.Row>
    <Table.Cell collapsing>
      <Checkbox
        checked={item.isDone}
        onChange={(ev, data) => setDone(data.checked)}
      />
    </Table.Cell>
    <Table.Cell>{item.qty}</Table.Cell>
    <Table.Cell>{item.text}</Table.Cell>
    <Table.Cell>{formatAsCurrency(item.price)}</Table.Cell>
    <Table.Cell>{formatAsCurrency(item.price * item.qty)}</Table.Cell>
    <Table.Cell>
      <Button icon onClick={edit}><Icon name="edit" /></Button>
      <Button icon secondary onClick={remove}><Icon name="delete" /></Button>
    </Table.Cell>
  </Table.Row>
));

const ItemListHeader = observer(({ store }) => (
  <Container>
    <Segment padded>
      <Label attached='top right'>Created at {store.item.createdAt.toString()}</Label>
      <h2>Item List</h2>
      <Grid columns={3} container doubling stackable>
        <Grid.Column>
          <Input
            fluid
            label="Name"
            name="name"
            value={store.item.name}
            onChange={e => store.setName(e.target.value)}
            placeholder="..."
            disabled={store.isLoading}
          />
        </Grid.Column>
        <Grid.Column>
          <Checkbox
            toggle
            checked={store.item.includeTaxes}
            onChange={(ev, data) => store.setIncludeTax(data.checked)}
            label="Include Taxes?"
          />
        </Grid.Column>
        <Grid.Column>
          <Button.Group>
            <Button
              icon="save"
              size="large"
              primary
              content="Save"
              labelPosition="left"
              loading={store.isLoading}
              onClick={() => store.save()}
            />
            <Button
              icon="trash"
              secondary
              size="large"
              content="Reset"
              labelPosition="right"
              loading={store.isLoading}
              onClick={() => store.reset()}
            />
          </Button.Group>
        </Grid.Column>
      </Grid>
    </Segment>
  </Container>
));

const ItemListFooter = observer(({ store }) => (
  <Table.Footer fullWidth>
    <Stat title="Sub-Total" value={store.subTotalStr} />
    <Stat title="Sub-Total Exp." value={store.subTotalExpectedStr} />
    {store.item.includeTaxes &&  <Stat title={`Taxes ${store.taxFactorStr}`} value={store.taxesStr} />}
    {store.item.includeTaxes &&  <Stat title={`Taxes Exp. ${store.taxFactorStr}`} value={store.taxesExpectedStr} />}
    <Stat title="Total" value={store.totalStr} />
    <Stat title="Total Exp." value={store.totalExpectedStr} />
  </Table.Footer>
));


const ItemListStats = observer(({ store }) => (
  <Segment section textAlign="center" padded>
    <Statistic.Group widths={store.item.includeTaxes ? 3 : 2}>
      <Statistic small label="Sub-Total" value={store.subTotalStr} />
      {store.item.includeTaxes && <Statistic small label={`Taxes ${store.taxFactorStr}`} value={store.taxesStr} />}
      <Statistic small label="Total" value={store.totalStr} />
    </Statistic.Group>
    <Divider />
    <Statistic.Group widths={store.item.includeTaxes ? 3 : 2}>
      <Statistic small label="Sub-Total Exp." value={store.subTotalExpectedStr} />
      {store.item.includeTaxes &&  <Statistic small label={`Taxes Exp. ${store.taxFactorStr}`} value={store.taxesExpectedStr} />}
      <Statistic small label="Total Exp." value={store.totalExpectedStr} />
    </Statistic.Group>
  </Segment>
));

const ItemList = inject(stores => ({ store: stores.itemList }))(observer(({ store, history, match }) => (
  <div>
    <ItemListHeader store={store} />
    <ItemListStats store={store} />
    <Table definition unstackable>
      <Table.Header fullWidth>
        <Table.Row>
          <Table.HeaderCell>
            <Checkbox onChange={(ev, data) => store.setDone(data.checked)} />
          </Table.HeaderCell>
          <Table.HeaderCell>Qty.</Table.HeaderCell>
          <Table.HeaderCell>Text</Table.HeaderCell>
          <Table.HeaderCell>Price</Table.HeaderCell>
          <Table.HeaderCell>Total</Table.HeaderCell>
          <Table.HeaderCell>
            <Button
              icon
              primary
              onClick={() => store.addView().then(() => history.push(`${HOME_PATH}/items/new`))}
            ><Icon name="add" /></Button>
          </Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
      {store.item.items.map((it, i) => (
        <ItemListRow
          key={i} index={i} item={it}
          edit={() => store.editView(i).then(() => history.push(`${HOME_PATH}/items/${i}`))}
          setDone={done => store.setItemDone(i, done)}
          remove={() => store.removeItem(i)}
        />
      ))}
      </Table.Body>
      <ItemListFooter store={store} />
    </Table>
  </div>
)));

const Stat = ({ title, value }) => (
  <Table.Row>
    <Table.HeaderCell colSpan={4}><Header as="h3" textAlign='right'>{title}</Header></Table.HeaderCell>
    <Table.HeaderCell colSpan={2}><Header as="h3" textAlign='right'>{value}</Header></Table.HeaderCell>
  </Table.Row>
);

// const isHomeActive = (pathname) => pathname === '/' || pathname === '/image' || pathname.indexOf('/items/');

const TopMenu = ({ history, match }) => (
  <Menu stackable>
    <Menu.Item header>Shop TO-DO List</Menu.Item>
    <Menu.Item
      name="list"
      active={history.location.pathname === `${HOME_PATH}/`}
      onClick={() => history.replace(`${HOME_PATH}/`)}
    >List</Menu.Item>

    <Menu.Item
      name="config"
      active={history.location.pathname === `${HOME_PATH}/config`}
      onClick={() => history.replace(`${HOME_PATH}/config`)}
    >Config</Menu.Item>
  </Menu>
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
            <Route path="/" component={TopMenu} />

            <Route exact path={`${HOME_PATH}/`} component={ItemList} />
            <Route exact path={`${HOME_PATH}/config`} component={Config} />
            <Route exact path={`${HOME_PATH}/items/:id`} component={NewItem} />
            <Route exact path={`${HOME_PATH}/image`} component={ImageTextDetector} />
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
