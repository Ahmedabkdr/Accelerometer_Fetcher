/**
 * Sample BLE React Native App
 *
 * @format
 * @flow strict-local
 */

import React, {useState, useEffect} from 'react';
import {
  StyleSheet,
  View,
  Text,
  StatusBar,
  NativeModules,
  NativeEventEmitter,
  Platform,
  PermissionsAndroid,
  FlatList,
  TouchableHighlight,
  useColorScheme,
  Pressable, TouchableOpacity
} from 'react-native';
import SafeAreaView from 'react-native-safe-area-view'

import {Colors} from 'react-native/Libraries/NewAppScreen';

const SECONDS_TO_SCAN_FOR = 3;
const SERVICE_UUIDS = [];
const ALLOW_DUPLICATES = false;

import BleManager from 'react-native-ble-manager';
import { Dirs, FileSystem } from 'react-native-file-access';
import RNFetchBlob from 'rn-fetch-blob';

import {NavigationContainer} from "@react-navigation/native";
import {createNativeStackNavigator} from "@react-navigation/native-stack";

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

const Stack = createNativeStackNavigator();

const App = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [peripherals, setPeripherals] = useState(new Map());
  const [isConnected, setIsConnected] = useState(false);
  let [currentPeripheral, setCurrentPeripheral] = useState(null);
  const theme = useColorScheme();
  const fileName = 'accelerometer.csv'; //whatever you want to call your file
  const filePath = `${Dirs.DocumentDir}/${fileName}`;

  const updatePeripherals = (key, value) => {
    setPeripherals(new Map(peripherals.set(key, value)));
  };

  const startScan = () => {
    if (!isScanning) {
      try {
        console.log('Scanning...');
        setIsScanning(true);
        BleManager.scan(SERVICE_UUIDS, SECONDS_TO_SCAN_FOR, ALLOW_DUPLICATES);
      } catch (error) {
        console.error(error);
      }
    }
  };

  const handleStopScan = () => {
    setIsScanning(false);
    console.log('Scan is stopped');
  };

  const handleDisconnectedPeripheral = data => {
    let peripheral = peripherals.get(data.peripheral);
    if (peripheral) {
      currentPeripheral = null;
      peripheral.connected = false;
      updatePeripherals(peripheral.id, peripheral);
    }
    console.log('Disconnected from ' + data.peripheral);
  };

  const handleUpdateValueForCharacteristic = async data => {
    let measurements = calcAccel(data.value[1],data.value[0]) +
        ',' + calcAccel(data.value[3],data.value[2]) +
        ',' + calcAccel(data.value[5], data.value[4]);
    console.log(
      'Received data from ' +
        data.peripheral +
        ' characteristic ' +
        data.characteristic,
        measurements,
    );

    RNFetchBlob.fs.writeStream(filePath, 'utf8', true)
    .then((stream) => {
        stream.write(Date.now() + "," + measurements + '\n')
        return stream.close()
    });
  };

  const calcAccel = (value1, value2) => {
    let accel = parseInt('0x'+ convToHex(value1) + convToHex(value2));
    if ((accel & 0x8000) > 0) {
       accel = accel - 0x10000;
    }
    return accel/1000;
  }

  const convToHex = value => {
    value = parseInt(value).toString(16).toUpperCase();
    if (value.length === 1) {
      value = "0" + value;
    }
    return value;
  }

  const handleDiscoverPeripheral = peripheral => {
    console.log('Got ble peripheral', peripheral);
    if (!peripheral.name) {
      peripheral.name = 'NO NAME';
    }
    updatePeripherals(peripheral.id, peripheral);
  };

  const togglePeripheralConnection = async peripheral => {
    if (peripheral && peripheral.connected) {
      BleManager.disconnect(peripheral.id);
    } else {
      connectPeripheral(peripheral);
    }
  };

  const goToPeripheral = (peripheral, navigation) => {
    if (peripheral.connected) {
      navigation.navigate('Peripheral');
    } else {
      connectPeripheral(peripheral);
    }
  };

  const connectPeripheral = async peripheral => {
    try {
      if (peripheral) {
        markPeripheral({connecting: true});
        await BleManager.connect(peripheral.id);
        markPeripheral({connecting: false, connected: true});
        setIsConnected(true);
        setCurrentPeripheral(peripheral);

        await BleManager.retrieveServices("4BE67751-5E54-3B46-2A20-E329813B524E").then(
          (peripheralInfo) => {
            // Success code
            console.log("Peripheral info:", peripheralInfo);
          }
          // "4BE67751-5E54-3B46-2A20-E329813B524E",
          // "E95D0753-251D-470A-A062-FA1922DFA9A8",
          // "E95DCA4B-251D-470A-A062-FA1922DFA9A8"
        );

        BleManager.startNotification(
          "4BE67751-5E54-3B46-2A20-E329813B524E",
          "E95D0753-251D-470A-A062-FA1922DFA9A8",
          "E95DCA4B-251D-470A-A062-FA1922DFA9A8"
        )
          .then(() => {
            // Success code
            console.log("Notification started");
          })
          .catch((error) => {
            // Failure code
            console.log(error);
          });
      }
    } catch (error) {
      console.log('Connection error', error);
    }
    function markPeripheral(props) {
      updatePeripherals(peripheral.id, {...peripheral, ...props});
    }
  };

  useEffect(() => {

    BleManager.start({showAlert: false});
    const listeners = [
      bleManagerEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        handleDiscoverPeripheral,
      ),
      bleManagerEmitter.addListener('BleManagerStopScan', handleStopScan),
      bleManagerEmitter.addListener(
        'BleManagerDisconnectPeripheral',
        handleDisconnectedPeripheral,
      ),
      bleManagerEmitter.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        handleUpdateValueForCharacteristic,
      ),
    ];

    handleAndroidPermissionCheck();

    return () => {
      console.log('unmount');
      for (const listener of listeners) {
        listener.remove();
      }
    };
  }, []);

  const handleAndroidPermissionCheck = () => {
    if (Platform.OS === 'android' && Platform.Version >= 23) {
      PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ).then(result => {
        if (result) {
          console.log('Permission is OK');
        } else {
          PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ).then(result => {
            if (result) {
              console.log('User accept');
            } else {
              console.log('User refuse');
            }
          });
        }
      });
    }
  };

  const renderItem = ({item, navigation}) => {
    const backgroundColor = item.connected ? "#069400" : Colors.white;
    return (
      <TouchableHighlight underlayColor='#0082FC'
                          onPress={() => togglePeripheralConnection(item)}
                          onLongPress={() => goToPeripheral(item, navigation)}>
        <View style={[styles.row, {backgroundColor}]}>
          <Text style={styles.peripheralName}>
            {item.name} {item.connecting && 'Connecting...'}
          </Text>
          <Text style={styles.rssi}>RSSI: {item.rssi}</Text>
          <Text style={styles.peripheralId}>{item.id}</Text>
        </View>
      </TouchableHighlight>
    );
  };

  const HomeScreen = ({ navigation }) => {

    // useEffect(() => {
    //   if (isConnected) {
    //     navigation.navigate('Peripheral')
    //   }
    // })

    return (
      <>
        <StatusBar />
        <SafeAreaView style={styles.body} forceInset={{ top: 'always', bottom: 'always' }}>
          <Pressable style={styles.scanButton} onPress={startScan}>
            <Text style={styles.scanButtonText}>
              {isScanning ? 'Scanning...' : 'Scan Bluetooth'}
            </Text>
          </Pressable>

          {Array.from(peripherals.values()).length == 0 && (
            <View style={styles.row}>
              <Text style={styles.noPeripherals}>No Peripherals, press "Scan Bluetooth" above</Text>
            </View>
          )}
          <FlatList
            data={Array.from(peripherals.values())}
            contentContainerStyle={{rowGap: 12}}
            renderItem={({item}) => renderItem({item, navigation})}
            keyExtractor={item => item.id}
          />
        </SafeAreaView>
      </>
    );
  };

  const PeripheralScreen = ({navigation}) => {
    const backgroundColor = "#069400";

    return (
        <>
        <StatusBar />
        <SafeAreaView style={styles.body} forceInset={{ top: 'always', bottom: 'always' }}>
          <TouchableOpacity style={styles.scanButton} onPress={() => navigation.navigate('Home')}>
            <Text style={styles.scanButtonText}>Back</Text>
          </TouchableOpacity>
          <View style={[styles.row, {backgroundColor}]}>
            <Text style={styles.rssi}>RSSI: {currentPeripheral.rssi}</Text>
            <Text style={styles.peripheralId}>{currentPeripheral.id}</Text>
          </View>
        </SafeAreaView>
      </>
    );
  };

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Peripheral"
          component={PeripheralScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const boxShadow = {
  shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
}


const styles = StyleSheet.create({
  engine: {
    position: 'absolute',
    right: 10,
    bottom: 0,
    color: Colors.black,
  },
  scanButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: "#0a398a",
    margin: 10,
    borderRadius: 12,
    ...boxShadow

  },
  scanButtonText: {
    fontSize: 20,
    letterSpacing: 0.25,
    color: Colors.white,
  },
  body: {
    backgroundColor: '#0082FC',
    flex: 1,
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.black,
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
    color: Colors.dark,
  },
  highlight: {
    fontWeight: '700',
  },
  footer: {
    color: Colors.dark,
    fontSize: 12,
    fontWeight: '600',
    padding: 4,
    paddingRight: 12,
    textAlign: 'right',
  },
  peripheralName: {
    fontSize: 16,
    textAlign: 'center',
    padding: 10,
  },
  rssi: {
    fontSize: 12,
    textAlign: 'center',
    padding: 2,
  },
  peripheralId: {
    fontSize: 12,
    textAlign: 'center',
    padding: 2,
    paddingBottom: 20,
  },
  row: {
    marginLeft: 10,
    marginRight: 10,
    borderRadius: 20,
    ...boxShadow
  },
  noPeripherals: {
    margin: 10,
    textAlign: 'center',
    color: Colors.white
  },
});


export default App;
