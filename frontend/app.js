import Vue from 'vue';
import App from './index.html';
import AddressList from './components/AddressList.vue';
import MapView from './components/MapView.vue';

new Vue({
  el: '#app',
  components: {
    AddressList,    
    MapView
  },
  render: h => h(App)
});