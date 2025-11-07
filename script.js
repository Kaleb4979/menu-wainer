// ====================================
// CONFIGURACIÓN (Variables tomadas de menu_data.json)
// ====================================
let MENU_DATA = null;
let ALL_ITEMS_MAP = {}; 
let cart = {}; 
let currentMesa = null; 
let deliveryFee = 0;
let deliveryCalculated = false; 
let userLocation = { lat: 0, lon: 0, distanceKm: 0 }; 

// >>> CONFIGURACIÓN PARA EL REGISTRO DE PEDIDOS Y TASA DE CAMBIO <<<
// Usamos la misma URL para ambos propósitos (doPost y doGet)
const ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbzpqx39mQ4VND0pvAp2udcJbugOI995I80QI18eME0tJ-BMlUOq2xqEuAT_6n2Gijnn/exec';

const LOG_ENDPOINT = ENDPOINT_URL; 
const RATE_ENDPOINT = ENDPOINT_URL; 
// =================================================================

// --- Funciones de Utilidad ---

function convertToVES(usdAmount) {
    // Si la tasa no se ha cargado (ej: fallo de red), usa 0 para evitar errores
    if (!MENU_DATA || !MENU_DATA.info.exchange_rate || isNaN(MENU_DATA.info.exchange_rate)) return 0;
    return usdAmount * MENU_DATA.info.exchange_rate;
}

function filterMenu() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
    const categories = document.querySelectorAll('.menu-category');

    categories.forEach(category => {
        const categoryName = category.querySelector('h2').textContent.toLowerCase();
        const items = category.querySelectorAll('.menu-item, .menu-item-complex');
        let categoryMatches = categoryName.includes(searchTerm);
        let itemFound = false;

        items.forEach(item => {
            const itemTitleEl = item.querySelector('.item-title') || item.querySelector('.item-info');
            const itemName = itemTitleEl ? itemTitleEl.textContent.toLowerCase() : '';

            if (itemName.includes(searchTerm) || searchTerm === '') {
                item.classList.remove('hidden');
                itemFound = true;
            } else {
                item.classList.add('hidden');
            }
        });

        if (searchTerm !== '' && !categoryMatches && !itemFound) {
            category.classList.add('hidden');
        } else {
            category.classList.remove('hidden');
        }
    });
}

function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (value) => (value * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; 
    
    return distance;
}

function getDeliveryCost(distanceKm) {
    const ratePerKm = 1.00;
    const minCost = 1.00;
    return Math.max(minCost, distanceKm * ratePerKm); 
}


// --- LÓGICA DE CARRO: Dos modos de añadir ---

function updateCart(itemId, change) {
    const itemData = ALL_ITEMS_MAP[itemId];
    if (!itemData || itemData.options) return;

    let currentQuantity = cart[itemId] ? cart[itemId].quantity : 0;
    let newQuantity = currentQuantity + change;

    if (newQuantity < 0) return;

    if (newQuantity === 0) {
        delete cart[itemId];
    } else {
        cart[itemId] = {
            id: itemId, 
            name: itemData.name,
            price: itemData.price,
            basePrice: itemData.price,
            quantity: newQuantity,
            isSimple: true 
        };
    }

    updateCartDisplay();
}

function addItemWithDetails(id, name, price, itemElement) {
    let details = [];
    
    const checkboxes = itemElement.querySelectorAll('.opciones-grupo input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (cb.checked) {
            details.push(cb.value);
        }
    });

    const notesBox = itemElement.querySelector('.instrucciones-box');
    const notes = notesBox ? notesBox.value.trim() : '';
    
    if (notes) {
        details.push(`Nota: ${notes}`);
    }

    const itemDetails = details.length > 0 ? ` (${details.join(', ')})` : '';
    const uniqueId = `${id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const itemName = name + itemDetails;

    cart[uniqueId] = { 
        id: uniqueId,
        name: itemName, 
        price: price, 
        basePrice: price,
        quantity: 1, 
        isSimple: false, 
        baseId: id 
    };
    
    if (notesBox) {
        notesBox.value = '';
    }
    checkboxes.forEach(cb => {
        if (cb.getAttribute('data-default-checked') === 'true') {
            cb.checked = true;
        } else {
            cb.checked = false;
        }
    });

    updateCartDisplay();
}

function removeItemFromCart(uniqueId) {
    if (cart[uniqueId]) {
        delete cart[uniqueId];
    }
    updateCartDisplay();
}


// --- LÓGICA DE CÁLCULO INMEDIATO DE DELIVERY (CON CORRECCIÓN DE ASINCRONÍA) ---

function calculateDeliveryFee(callback) {
    if (!MENU_DATA) {
        if (callback) callback(0, 0, 0, 0);
        return;
    }

    const checkoutBtn = document.getElementById('checkout-btn');
    const loadingMessage = document.getElementById('loading-location');
    
    // Si ya fue calculado con éxito, usamos los datos guardados
    if (deliveryCalculated && !callback) {
        updateCartDisplay(); 
        return;
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                // RUTA DE ÉXITO
                const clientLat = position.coords.latitude;
                const clientLon = position.coords.longitude;
                
                const ORIGIN_LAT = MENU_DATA.info.origin_lat;
                const ORIGIN_LON = MENU_DATA.info.origin_lon;
                
                const distanceKm = calculateDistance(ORIGIN_LAT, ORIGIN_LON, clientLat, clientLon);
                
                deliveryFee = getDeliveryCost(distanceKm); 
                deliveryCalculated = true; 
                userLocation = { lat: clientLat, lon: clientLon, distanceKm: distanceKm };

                loadingMessage.style.display = 'none';
                checkoutBtn.disabled = false;
                
                if (callback) callback(deliveryFee, distanceKm, clientLat, clientLon);
                updateCartDisplay(); 
            },
            (error) => {
                // RUTA DE ERROR
                console.error('Error de geolocalización:', error);
                
                let errorMessage = 'Error: No se pudo obtener la ubicación.';
                if (error.code === 1) {
                    errorMessage = 'PERMISO DENEGADO. Por favor, habilite la ubicación en su navegador.';
                } else if (error.code === 2) {
                    errorMessage = 'Ubicación no disponible.';
                } else if (error.code === 3) {
                    errorMessage = 'Tiempo de espera agotado.';
                }

                // Fallo: usar 0 costo y no marcar como calculado
                deliveryFee = 0;
                deliveryCalculated = false; 
                userLocation = { lat: 0, lon: 0, distanceKm: 0 };

                loadingMessage.textContent = `❌ ${errorMessage} Costo de Delivery: 0.00$`;
                loadingMessage.style.display = 'block';
                
                // Si la llamada viene de checkAndSendOrder, necesitamos notificar el fallo
                if (callback) {
                    callback(0, 0, 0, 0); 
                } else {
                    // Si viene del toggle, rehabilita el botón después de 5s
                    setTimeout(() => {
                        loadingMessage.style.display = 'none';
                        checkoutBtn.disabled = calculateSubtotal() === 0; 
                        updateCartDisplay();
                    }, 5000); 
                }
                updateCartDisplay(); 
            },
            {
                enableHighAccuracy: true,
                timeout: 7000, 
                maximumAge: 0
            }
        );
    } else {
        // RUTA DE NAVEGADOR SIN SOPORTE
        deliveryFee = 0;
        deliveryCalculated = false;
        loadingMessage.textContent = 'Geolocalización no soportada por su dispositivo.';
        loadingMessage.style.display = 'block';
        
        setTimeout(() => {
            loadingMessage.style.display = 'none';
        }, 5000);

        if (callback) callback(0, 0, 0, 0); 
        updateCartDisplay();
    }
}

function handleDeliveryToggle() {
    const isDelivery = document.getElementById('delivery-checkbox').checked;
    const loadingMessage = document.getElementById('loading-location');
    
    if (isDelivery) {
        loadingMessage.textContent = 'Obteniendo tu ubicación para calcular el costo... Por favor, acepta el permiso.';
        loadingMessage.style.display = 'block';
        // Calcular sin callback para que solo actualice el display (proactivo)
        calculateDeliveryFee(null); 
    } else {
        deliveryFee = 0;
        deliveryCalculated = false;
        userLocation = { lat: 0, lon: 0, distanceKm: 0 };
        loadingMessage.style.display = 'none';
        updateCartDisplay(); 
    }
}

function calculateSubtotal() {
    let subtotal = 0;
    for (const uniqueId in cart) {
        subtotal += cart[uniqueId].price * cart[uniqueId].quantity;
    }
    return subtotal;
}

// --- Función principal para cargar el menú y Renderizar ---
async function loadMenuData() {
    try {
        // 1. OBTENER TASA DE CAMBIO DESDE EL EXCEL (APPS SCRIPT)
        let rate = 0;
        try {
            // Llama al Apps Script usando GET para obtener la tasa de la celda A2 de la Hoja 1
            const rateResponse = await fetch(RATE_ENDPOINT); 
            const rateData = await rateResponse.json();
            rate = parseFloat(rateData.exchange_rate);
            if (isNaN(rate) || rate <= 0) {
                 rate = 290.00; // Tasa de emergencia o default
                 console.warn("La tasa de cambio obtenida del servidor no es válida. Usando 290.00 como default.");
            }
        } catch (rateError) {
             rate = 290.00; // Tasa de emergencia si la API falla
             console.error("Error al obtener la tasa de cambio del Apps Script. Usando 290.00 como default.", rateError);
        }
        
        // 2. OBTENER DATOS PRINCIPALES DEL MENÚ
        const response = await fetch('menu_data.json');
        if (!response.ok) {
            throw new Error('No se pudo cargar menu_data.json');
        }
        const data = await response.json();
        
        // Asignar la tasa obtenida al objeto MENU_DATA
        data.info.exchange_rate = rate; 
        MENU_DATA = data;
        
        // LÓGICA DE MESA
        const mesaParam = getUrlParameter('mesa');
        const orderOptionsEl = document.querySelector('.order-options');
        const mesaInfoEl = document.getElementById('mesa-info');
        
        if (mesaParam && !isNaN(parseInt(mesaParam))) {
            currentMesa = parseInt(mesaParam);
            if (mesaInfoEl) { 
                mesaInfoEl.style.display = 'block';
                mesaInfoEl.textContent = `¡Estás pidiendo desde la MESA N° ${currentMesa}! Tu pedido es para comer en local.`;
            }
            if (orderOptionsEl) { 
                orderOptionsEl.style.display = 'none';
            }
        } else {
            currentMesa = null;
            if (orderOptionsEl) { 
                orderOptionsEl.style.display = 'flex'; 
            }
        }
        
        // RENDERIZADO DEL MENÚ
        document.getElementById('promo-container').textContent = data.info.promo;
        document.getElementById('schedule-container').innerHTML = `🕔 **HORARIO DE ATENCIÓN:** ${data.info.schedule}`;
        
        let menuHtml = '';
        data.categories.forEach(category => {
            menuHtml += `
                <section class="menu-category">
                    <h2>${category.name}</h2>
                    <p class="slogan">${category.slogan}</p>
                    <div class="menu-item-list">
            `;

            category.items.forEach(item => {
                ALL_ITEMS_MAP[item.id] = item;
                const topVentaTag = item.top_venta ? '<span class="top-venta-tag">⭐ TOP VENTA</span>' : '';
                const isComplex = item.options && item.options.length > 0;
                
                if (isComplex) {
                    let optionsHTML = '';
                    let placeholderText = 'Instrucciones Especiales: (Ej: Poco queso, sin lechuga)';

                    optionsHTML += '<h3 class="opciones-titulo">Personaliza tu ' + item.name + ':</h3>';
                    optionsHTML += '<div class="opciones-grupo">';
                    item.options.forEach(option => {
                        const isChecked = option.checked ? 'checked' : '';
                        const defaultAttr = option.checked ? 'data-default-checked="true"' : '';
                        optionsHTML += `
                            <label>
                                <input type="checkbox" value="${option.value}" ${isChecked} ${defaultAttr}> 
                                ${option.label}
                            </label>`;
                    });
                    optionsHTML += '</div>';
                    placeholderText = 'Instrucciones: (Ej: Sin pepinillos, extra queso)';

                    menuHtml += `
                        <div class="menu-item-complex" data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">
                            <div class="item-header">
                                <span class="item-title">${item.name} ${topVentaTag}</span>
                                <span class="price">${item.price.toFixed(2)}$</span>
                            </div>
                            ${optionsHTML}
                            <textarea placeholder="${placeholderText}" rows="2" class="instrucciones-box"></textarea>
                            <button class="add-to-cart-btn full-width" onclick="addItemWithDetails('${item.id}', '${item.name}', ${item.price}, this.parentNode)">
                                Añadir ${item.name} al Pedido
                            </button>
                        </div>
                    `;

                } else {
                    menuHtml += `
                        <div class="menu-item" data-id="${item.id}">
                            <span class="item-info">${item.name} ${topVentaTag}</span>
                            <div class="item-controls">
                                <span class="price">${item.price.toFixed(2)}$</span>
                                <div class="quantity-control">
                                    <button class="quantity-btn" onclick="updateCart('${item.id}', -1)">-</button>
                                    <span class="item-quantity">0</span>
                                    <button class="quantity-btn" onclick="updateCart('${item.id}', 1)">+</button>
                                </div>
                            </div>
                        </div>
                    `;
                }
            });

            menuHtml += `
                    </div>
                </section>
            `;
        });

        document.getElementById('menu-content-container').innerHTML = menuHtml;
        
        document.getElementById('search-input').addEventListener('input', filterMenu);
        
        updateCartDisplay();
        setInterval(updateCartDisplay, 1000);

    } catch (error) {
        console.error("Error al cargar o renderizar el menú:", error);
        document.getElementById('menu-content-container').innerHTML = `<p style="color:red; text-align:center;">❌ ERROR: No se pudo cargar el menú. Verifica que el archivo **menu_data.json** exista y esté correcto.</p>`;
    }
}


// --- FUNCIONES DE DISPLAY Y CARRITO ---

function renderCartItems() {
    const cartContainer = document.getElementById('cart-items-container');
    cartContainer.style.display = 'none';
    cartContainer.innerHTML = '';
}

function updateCartDisplay() {
    if (!MENU_DATA) return;

    let subtotal = calculateSubtotal();
    let totalItems = 0;
    
    for (const uniqueId in cart) {
        totalItems += cart[uniqueId].quantity;
    }
    
    renderCartItems(); 

    document.querySelectorAll('.menu-item').forEach(itemEl => {
        const itemId = itemEl.getAttribute('data-id');
        const quantityElement = itemEl.querySelector('.item-quantity');
        quantityElement.textContent = cart[itemId] && cart[itemId].isSimple ? cart[itemId].quantity : 0;
    });
    
    document.getElementById('cart-item-count').textContent = totalItems;
    document.getElementById('cart-item-count').style.display = totalItems > 0 ? 'inline-block' : 'none';


    const isDelivery = currentMesa ? false : document.getElementById('delivery-checkbox').checked; 
    
    const deliveryDetails = document.getElementById('delivery-details');
    const checkoutBtn = document.getElementById('checkout-btn');
    const loadingMessage = document.getElementById('loading-location'); 

    // Lógica de Cooldown
    const lastOrderTime = localStorage.getItem('lastOrderTime');
    const now = Date.now();
    const COOLDOWN_SECS = MENU_DATA.info.cooldown_seconds;
    const cooldownBar = document.getElementById('cooldown-bar');
    const cooldownFill = document.getElementById('cooldown-fill');
    const cooldownText = document.getElementById('cooldown-text');
    
    let isCooldownActive = false;
    if (lastOrderTime && (now - lastOrderTime) < (COOLDOWN_SECS * 1000)) {
        isCooldownActive = true;
        checkoutBtn.disabled = true;
        cooldownBar.style.display = 'flex'; 
        checkoutBtn.style.visibility = 'hidden'; 
        
        const elapsedSeconds = (now - lastOrderTime) / 1000;
        const remainingSeconds = Math.ceil(COOLDOWN_SECS - elapsedSeconds);
        const progressPercent = (elapsedSeconds / COOLDOWN_SECS) * 100;

        cooldownFill.style.width = `${progressPercent}%`;
        cooldownText.textContent = `ESPERA: ${remainingSeconds}s para nuevo pedido`;
        
    } else {
        cooldownBar.style.display = 'none'; 
        checkoutBtn.style.visibility = 'visible'; 
        checkoutBtn.disabled = totalItems === 0;
    }


    let currentTotal = subtotal;
    
    document.getElementById('cart-total-price').textContent = subtotal.toFixed(2);
    
    // >>> LÓGICA DE CONVERSIÓN VES DINÁMICA <<<
    const totalVES = convertToVES(currentTotal);
    const rate = MENU_DATA.info.exchange_rate;
    
    const conversionContainer = document.getElementById('conversion-container');

    if (totalItems > 0) {
        const conversionHtml = `
            <span class="conversion-rate">Tasa: ${rate.toFixed(2)} VES/USD</span>
            <span class="conversion-ves">Total en BS: ${totalVES.toFixed(2)} VES</span>
        `;
        conversionContainer.innerHTML = conversionHtml;
        conversionContainer.style.display = 'flex';
    } else {
        conversionContainer.innerHTML = '';
        conversionContainer.style.display = 'none';
    }
    // >>> FIN LÓGICA DE CONVERSIÓN <<<

    // LÓGICA DE BOTÓN Y MENSAJES DE MESA/DELIVERY
    
    if (currentMesa) {
        deliveryDetails.textContent = "";
        loadingMessage.style.display = 'none';
        if (totalItems > 0 && !isCooldownActive) {
            checkoutBtn.textContent = `Hacer Pedido MESA ${currentMesa} - Total: ${currentTotal.toFixed(2)}$`;
        }
    } else if (isDelivery) {
        
        if (deliveryCalculated) {
            loadingMessage.style.display = 'none'; 
            currentTotal += deliveryFee;
            deliveryDetails.textContent = `✅ Costo de Delivery calculado: ${deliveryFee.toFixed(2)}$ (a ${userLocation.distanceKm.toFixed(2)} km)`;
            document.getElementById('cart-total-price').textContent = currentTotal.toFixed(2);
            
            if (totalItems > 0 && !isCooldownActive) {
                 checkoutBtn.textContent = `Hacer Pedido (${totalItems} ítems) - TOTAL: ${currentTotal.toFixed(2)}$`;
            }
            
        } else {
             if (loadingMessage.style.display !== 'block') { 
                deliveryDetails.textContent = "Costo de Delivery se calculará al confirmar la ubicación. (1$ por km, mínimo 1$)";
             }
             
             if (totalItems > 0 && !isCooldownActive) {
                 checkoutBtn.textContent = `Hacer Pedido (${totalItems} ítems) - Subtotal: ${subtotal.toFixed(2)}$`;
             }
        }
    } else {
        loadingMessage.style.display = 'none'; 
        deliveryDetails.textContent = "Retiro en Tienda seleccionado.";
        
        if (totalItems > 0 && !isCooldownActive) {
            checkoutBtn.textContent = `Hacer Pedido (${totalItems} ítems) - Total: ${subtotal.toFixed(2)}$`;
        }
    }

    if (totalItems === 0) {
        document.getElementById('cart-total-price').textContent = "0.00";
        if (!isCooldownActive) {
             checkoutBtn.textContent = "Hacer Pedido por WhatsApp";
        }
    }
}


// --- Lógica de Envío Final (Envío a WhatsApp y Log) ---

function sendOrder(subtotal, finalTotal, distanceKm, lat, lon) {
    
    const isDelivery = !currentMesa && document.getElementById('delivery-checkbox').checked;
    
    // ETIQUETADO DE PRIORIDAD PARA WHATSAPP
    let serviceTag = "[RETIRO] 🚶"; 
    if (currentMesa) {
        serviceTag = `[MESA-${currentMesa}] 🍽️`;
    } else if (isDelivery) {
        serviceTag = "[DELIVERY] 🚚";
    }
    
    let message = `🛒 *NUEVO PEDIDO PA QUE WAINER* ${serviceTag}\n\n`;
    
    // AGRUPACIÓN DE ITEMS SIMPLES PARA CLARIDAD DEL MENSAJE
    const consolidatedCart = {};

    for (const uniqueId in cart) {
        const item = cart[uniqueId];
        if (item.isSimple) {
            consolidatedCart[item.id] = consolidatedCart[item.id] || { name: item.name, quantity: 0, price: item.price };
            consolidatedCart[item.id].quantity += item.quantity;
        } else {
            consolidatedCart[uniqueId] = item;
        }
    }

    let index = 1;
    for (const id in consolidatedCart) {
        const item = consolidatedCart[id];
        const itemQty = item.quantity;
        const itemName = item.name;
        const itemPrice = item.price * itemQty;

        message += `${index}. *${itemQty}x* ${itemName} = ${itemPrice.toFixed(2)}$\n`; 
        index++;
    }

    message += "\n----------------------------------\n";
    
    // LÓGICA DE TOTAL Y CONVERSIÓN VES PARA EL MENSAJE
    const totalVES = convertToVES(finalTotal);
    
    // Formato de URL de Google Maps (funcional para log y mensaje)
    const mapsUrl = (lat && lon) ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : "N/A";
    
    if (currentMesa) {
        message += `📍 *ORDEN DE MESA N°: ${currentMesa}*\n`;
        message += `✅ *SERVICIO:* COMER EN LOCAL 🍽️\n`;
        message += `💰 *TOTAL A PAGAR (USD):* ${subtotal.toFixed(2)}$\n`;
        message += `💰 *TOTAL A PAGAR (VES):* ${totalVES.toFixed(2)} VES\n`;
        
    } else if (isDelivery) {
        
        if (distanceKm > 0 && lat && lon) {
            const deliveryCost = finalTotal - subtotal;
            
            message += `✅ *SERVICIO:* DELIVERY 🚚\n`;
            message += `📍 *DISTANCIA CALCULADA:* ${distanceKm.toFixed(2)} km\n`;
            message += `💵 *COSTO DELIVERY:* ${deliveryCost.toFixed(2)}$ (1$/km, mínimo 1$)\n`;
            message += `\n*SUBTOTAL (Comida):* ${subtotal.toFixed(2)}$\n`;
            message += `*TOTAL FINAL (USD):* ${finalTotal.toFixed(2)}$\n`;
            message += `*TOTAL FINAL (VES):* ${totalVES.toFixed(2)} VES\n`;
            message += `🗺️ *UBICACIÓN CLIENTE:* ${mapsUrl}\n`;
            
        } else {
            message += `❌ *SERVICIO:* DELIVERY (FALLIDO) 🚚\n`;
            message += `⚠️ *ATENCIÓN:* No se pudo obtener la ubicación. El costo de delivery se calculará a la entrega.\n`;
            message += `\n*TOTAL A PAGAR (Comida - USD):* ${subtotal.toFixed(2)}$\n`;
            message += `*TOTAL ESTIMADO (VES):* ${totalVES.toFixed(2)} VES\n`;
        }
    } else {
        message += `✅ *SERVICIO:* RETIRO EN TIENDA 🚶\n`;
        message += `💰 *TOTAL A PAGAR (USD):* ${subtotal.toFixed(2)}$\n`;
        message += `💰 *TOTAL A PAGAR (VES):* ${totalVES.toFixed(2)} VES\n`;
    }
    
    message += "----------------------------------\n";
    message += `Tasa VES/USD utilizada: ${MENU_DATA.info.exchange_rate.toFixed(2)}\n`;
    message += "\nPor favor, indique su nombre.";
    
    
    // ----------------------------------------------------
    // LÓGICA DE REGISTRO EN GOOGLE SHEETS
    // ----------------------------------------------------
    const serviceType = currentMesa ? `Mesa N° ${currentMesa}` : (isDelivery ? 'Delivery' : 'Retiro en Tienda');
    const mapsUrlForLog = (lat && lon) ? mapsUrl : "N/A";

    const logData = {
        fecha: new Date().toLocaleDateString('es-VE'),
        hora: new Date().toLocaleTimeString('es-VE'),
        total: finalTotal.toFixed(2),
        servicio: serviceType,
        distancia: distanceKm > 0 ? `${distanceKm.toFixed(2)} km` : "N/A",
        detalle_pedido: Object.values(consolidatedCart).map(item => `${item.quantity}x ${item.name}`).join('; '),
        ubicacion_url: mapsUrlForLog
    };

    fetch(LOG_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors', 
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(logData)
    })
    .then(response => {
        console.log("Datos de pedido enviados para registro.");
    })
    .catch(error => console.error('Error al intentar registrar el pedido:', error));
    
    // ----------------------------------------------------
    // APERTURA DE WHATSAPP
    // ----------------------------------------------------

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${MENU_DATA.info.whatsapp_number}?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
    
    localStorage.setItem('lastOrderTime', Date.now());

    cart = {};
    updateCartDisplay();
    
    // Restablece los mensajes de carga y botón después de enviar
    document.getElementById('loading-location').style.display = 'none';
    document.getElementById('checkout-btn').disabled = true;
}

function checkAndSendOrder() {
    
    if (!MENU_DATA) {
         alert("Error: El menú no se ha cargado correctamente.");
         return;
    }

    // 1. VERIFICACIÓN DEL LÍMITE DE TIEMPO
    const lastOrderTime = localStorage.getItem('lastOrderTime');
    const now = Date.now();
    const COOLDOWN_SECS = MENU_DATA.info.cooldown_seconds;
    if (lastOrderTime && (now - lastOrderTime) < (COOLDOWN_SECS * 1000)) {
        return;
    }
    
    let subtotal = calculateSubtotal();

    if (Object.keys(cart).length === 0) {
        alert("Por favor, agregue al menos un artículo al carrito antes de hacer el pedido.");
        return;
    }

    // MESA (Opción A)
    if (currentMesa) {
        sendOrder(subtotal, subtotal, 0, 0, 0);
        return;
    }
    
    // RETIRO (Opción B)
    const isDelivery = document.getElementById('delivery-checkbox').checked;

    if (!isDelivery) {
        sendOrder(subtotal, subtotal, 0, 0, 0);
        return;
    }
    
    // DELIVERY (Opción C - Requiere Geolocalización Asíncrona)
    
    const checkoutBtn = document.getElementById('checkout-btn');
    const loadingMessage = document.getElementById('loading-location');
    
    // Bloquear UI y mostrar mensaje
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Calculando ubicación...';
    loadingMessage.style.display = 'block';
    loadingMessage.textContent = 'Obteniendo tu ubicación para calcular el costo... Por favor, acepta el permiso.';

    // Llama a la función de cálculo con un callback que llama a sendOrder SÓLO cuando termina.
    calculateDeliveryFee((fee, distanceKm, clientLat, clientLon) => {
        
        const final = subtotal + fee;
        sendOrder(subtotal, final, distanceKm, clientLat, clientLon);
        
        // El botón se rehabilita al final de sendOrder (aunque el carrito se vacía)
    });
}

document.addEventListener('DOMContentLoaded', loadMenuData);
