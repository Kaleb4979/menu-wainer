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
let finalOrderData = null; // Almacena temporalmente los datos del pedido antes del pago

// >>> CONFIGURACIÓN PARA EL REGISTRO DE PEDIDOS Y TASA DE CAMBIO (MISMA URL) <<<
const ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbzpqx39mQ4VND0pvAp2udcJbugOI995I80QI18eME0tJ-BMlUOq2xqEuAT_6n2Gijnn/exec';

const LOG_ENDPOINT = ENDPOINT_URL; 
const RATE_ENDPOINT = ENDPOINT_URL; 
// =================================================================

// --- Funciones de Utilidad y Vistas ---

function showVideos() {
    document.getElementById('videos-section').style.display = 'block';
    document.getElementById('menu-main-content').style.display = 'none';
    document.querySelector('.cart-float').style.display = 'none'; 
    window.scrollTo(0, 0); 
}

function showMenuContent() {
    document.getElementById('videos-section').style.display = 'none';
    document.getElementById('menu-main-content').style.display = 'block';
    document.querySelector('.cart-float').style.display = 'flex'; 
    window.scrollTo(0, 0); 
}

function convertToVES(usdAmount) {
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

function calculateSubtotal() {
    let subtotal = 0;
    for (const uniqueId in cart) {
        subtotal += cart[uniqueId].price * cart[uniqueId].quantity;
    }
    return subtotal;
}

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

// --- LÓGICA DE GEOLOCALIZACIÓN Y DELIVERY (sin cambios funcionales) ---

function calculateDeliveryFee(callback) {
    if (!MENU_DATA) {
        if (callback) callback(0, 0, 0, 0);
        return;
    }
    // ... [código de calculateDeliveryFee sin cambios] ...
    const checkoutBtn = document.getElementById('checkout-btn');
    const loadingMessage = document.getElementById('loading-location');
    
    if (deliveryCalculated && !callback) {
        updateCartDisplay(); 
        return;
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
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
                console.error('Error de geolocalización:', error);
                
                let errorMessage = 'Error: No se pudo obtener la ubicación.';
                if (error.code === 1) {
                    errorMessage = 'PERMISO DENEGADO. Por favor, habilite la ubicación en su navegador.';
                } else if (error.code === 2) {
                    errorMessage = 'Ubicación no disponible.';
                } else if (error.code === 3) {
                    errorMessage = 'Tiempo de espera agotado.';
                }

                deliveryFee = 0;
                deliveryCalculated = false; 
                userLocation = { lat: 0, lon: 0, distanceKm: 0 };

                loadingMessage.textContent = `❌ ${errorMessage} Costo de Delivery: 0.00$`;
                loadingMessage.style.display = 'block';
                
                if (callback) {
                    callback(0, 0, 0, 0); 
                } else {
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
        calculateDeliveryFee(null); 
    } else {
        deliveryFee = 0;
        deliveryCalculated = false;
        userLocation = { lat: 0, lon: 0, distanceKm: 0 };
        loadingMessage.style.display = 'none';
        updateCartDisplay(); 
    }
}


// --- LÓGICA DE CARGA Y DISPLAY (sin cambios funcionales) ---
// ... [código de loadMenuData y updateCartDisplay sin cambios] ...

async function loadMenuData() {
    try {
        let rate = 0;
        try {
            const nocacheUrl = RATE_ENDPOINT + '?v=' + new Date().getTime(); 
            const rateResponse = await fetch(nocacheUrl); 
            const rateData = await rateResponse.json();
            rate = parseFloat(rateData.exchange_rate);
            if (isNaN(rate) || rate <= 0) {
                 rate = 290.00; 
                 console.warn("La tasa de cambio obtenida del servidor no es válida. Usando 290.00 como default.");
            }
        } catch (rateError) {
             rate = 290.00; 
             console.error("Error al obtener la tasa de cambio del Apps Script. Usando 290.00 como default.", rateError);
        }
        
        const response = await fetch('menu_data.json');
        if (!response.ok) {
            throw new Error('No se pudo cargar menu_data.json');
        }
        const data = await response.json();
        
        data.info.exchange_rate = rate; 
        MENU_DATA = data;
        
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
                
                if (item.id === 'link-videos') {
                     menuHtml += `
                        <div class="menu-item link-item" data-id="${item.id}" onclick="showVideos()">
                            <span class="item-info" style="color: var(--color-wainer-gold); font-weight: bold; font-size: 1.2em;">
                                ${item.name} 🎬
                            </span>
                            <div class="item-controls">
                                <span class="price" style="background: none; padding: 0;">¡Ver ahora!</span>
                            </div>
                        </div>
                    `;
                    return; 
                }

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

function updateCartDisplay() {
    if (!MENU_DATA) return;

    let subtotal = calculateSubtotal();
    let totalItems = 0;
    
    for (const uniqueId in cart) {
        totalItems += cart[uniqueId].quantity;
    }
    
    // ... (omitted cart display rendering logic for brevity, assumed functional) ...
    document.querySelectorAll('.menu-item').forEach(itemEl => {
        const itemId = itemEl.getAttribute('data-id');
        const quantityElement = itemEl.querySelector('.item-quantity');
        
        if (quantityElement) {
             quantityElement.textContent = cart[itemId] && cart[itemId].isSimple ? cart[itemId].quantity : 0;
        }
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


// --- LÓGICA DEL MODAL DE PAGO ---

function showPaymentModal() {
    if (!MENU_DATA) return alert("Error: El menú no se ha cargado.");
    
    // 1. Verificar límites de tiempo y carrito vacío (similar a showConfirmationModal)
    const lastOrderTime = localStorage.getItem('lastOrderTime');
    const now = Date.now();
    const COOLDOWN_SECS = MENU_DATA.info.cooldown_seconds;
    
    if (lastOrderTime && (now - lastOrderTime) < (COOLDOWN_SECS * 1000)) return;
    if (Object.keys(cart).length === 0) return alert("Por favor, agregue al menos un artículo al carrito antes de hacer el pedido.");

    // 2. Determinar si se requiere Geolocalización para obtener el total final
    const subtotal = calculateSubtotal();
    const isDelivery = document.getElementById('delivery-checkbox').checked && !currentMesa;
    const checkoutBtn = document.getElementById('checkout-btn');
    const loadingMessage = document.getElementById('loading-location');
    
    const displayModal = (total, fee, distanceKm, clientLat, clientLon, serviceText) => {
        // Almacenar los datos calculados para su uso posterior en processFinalOrder
        finalOrderData = { subtotal, total, fee, distanceKm, clientLat, clientLon, serviceText };
        
        // Actualizar el UI del modal
        document.getElementById('payment-modal').style.display = 'flex';
        document.getElementById('payment-total-display').textContent = `${total.toFixed(2)}$`;
        document.getElementById('payment-servicio-display').textContent = serviceText;
        
        let deliveryInfo = '';
        if (isDelivery) {
            deliveryInfo = `(+${fee.toFixed(2)}$ de Delivery a ${distanceKm.toFixed(2)} km)`;
        }
        document.getElementById('payment-delivery-info').textContent = deliveryInfo;
        
        // Resetear inputs de pago y botón
        document.getElementById('cash-given-input').value = '';
        document.getElementById('vuelto-display').textContent = 'Vuelto: 0.00$';
        document.getElementById('btn-final-whatsapp').disabled = true;
        document.getElementById('cash-details').style.display = 'none';
        document.getElementById('mobile-details').style.display = 'none';
        
        // Asegurarse de que ningún radio esté marcado al abrir
        document.querySelectorAll('input[name="payment-method"]').forEach(radio => radio.checked = false);
        
        loadingMessage.style.display = 'none';
        checkoutBtn.disabled = false; // Rehabilita el botón de la barra flotante (oculto por el modal)
    };

    if (currentMesa) {
        // MESA o Retiro (Total = Subtotal)
        displayModal(subtotal, 0, 0, 0, 0, currentMesa ? `MESA N° ${currentMesa} 🍽️` : "Retiro en Tienda 🚶");
        
    } else if (isDelivery && !deliveryCalculated) {
        // DELIVERY (Requiere cálculo Asíncrono)
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Calculando ubicación...';
        loadingMessage.style.display = 'block';
        loadingMessage.textContent = 'Obteniendo tu ubicación...';
        
        calculateDeliveryFee((fee, distanceKm, clientLat, clientLon) => {
             const final = subtotal + fee;
             const serviceText = fee > 0 ? "Delivery 🚚" : "Delivery (Sin Ubicación)";
             displayModal(final, fee, distanceKm, clientLat, clientLon, serviceText);
        });

    } else {
        // Retiro o Delivery ya calculado
        const final = subtotal + deliveryFee;
        const serviceText = isDelivery ? "Delivery 🚚" : "Retiro en Tienda 🚶";
        displayModal(final, deliveryFee, userLocation.distanceKm, userLocation.lat, userLocation.lon, serviceText);
    }
}

function closePaymentModal() {
    document.getElementById('payment-modal').style.display = 'none';
    finalOrderData = null; // Limpiar datos
    updateCartDisplay(); // Forzar actualización de la barra flotante
}

function showPaymentDetails(method) {
    const cashDetails = document.getElementById('cash-details');
    const mobileDetails = document.getElementById('mobile-details');
    const finalBtn = document.getElementById('btn-final-whatsapp');
    
    // Limpiar campos
    document.getElementById('cash-given-input').value = '';
    document.getElementById('vuelto-display').textContent = 'Vuelto: 0.00$';
    document.getElementById('comprobante-file-input').value = '';

    if (method === 'cash') {
        cashDetails.style.display = 'block';
        mobileDetails.style.display = 'none';
        // En efectivo, el botón se habilita inmediatamente (se asume que el pago se realizará)
        finalBtn.disabled = false; 
    } else if (method === 'mobile') {
        cashDetails.style.display = 'none';
        mobileDetails.style.display = 'block';
        // En pago móvil, el botón se habilita al subir el comprobante (ver listener en DOMContentLoaded)
        finalBtn.disabled = document.getElementById('comprobante-file-input').files.length === 0;
    }
}

function calculateChange() {
    const total = finalOrderData ? finalOrderData.total : 0;
    const cashGiven = parseFloat(document.getElementById('cash-given-input').value) || 0;
    const vueltoDisplay = document.getElementById('vuelto-display');
    
    if (cashGiven >= total) {
        const vuelto = cashGiven - total;
        vueltoDisplay.textContent = `Vuelto: ${vuelto.toFixed(2)}$`;
        vueltoDisplay.style.color = var(--color-wainer-gold);
    } else if (cashGiven > 0) {
        vueltoDisplay.textContent = `Faltan: ${(total - cashGiven).toFixed(2)}$`;
        vueltoDisplay.style.color = var(--color-wainer-red);
    } else {
        vueltoDisplay.textContent = 'Vuelto: 0.00$';
        vueltoDisplay.style.color = var(--color-wainer-gold);
    }
    
    // Habilitar el botón si la cantidad cubre el total o si es Pago Móvil (ya manejado por showPaymentDetails)
    document.getElementById('btn-final-whatsapp').disabled = cashGiven < total;
}

document.addEventListener('DOMContentLoaded', () => {
    loadMenuData();
    
    // Listener para habilitar el botón si se adjunta comprobante
    document.getElementById('comprobante-file-input').addEventListener('change', (e) => {
        const finalBtn = document.getElementById('btn-final-whatsapp');
        const isMobileSelected = document.querySelector('input[name="payment-method"][value="pago_movil"]').checked;
        if (isMobileSelected) {
             finalBtn.disabled = e.target.files.length === 0;
        }
    });

    // Añadir listener para el cálculo de vuelto
    document.getElementById('cash-given-input').addEventListener('input', calculateChange);
});


/**
 * 1. Procesa los datos de pago y los agrega a finalOrderData.
 * 2. Construye el mensaje FINAL y abre WhatsApp.
 * 3. Llama a logOrderToSheet.
 */
function processFinalOrder() {
    if (!finalOrderData) return alert("Error: Datos del pedido incompletos. Intente de nuevo.");
    
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value;
    const checkoutBtn = document.getElementById('btn-final-whatsapp');
    
    if (!paymentMethod) return alert("Por favor, selecciona un método de pago.");
    
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Procesando...';

    let paymentDetailMessage = "";
    let paymentDetailLog = "";
    
    // 1. Obtener detalles de pago
    if (paymentMethod === 'efectivo') {
        const total = finalOrderData.total;
        const cashGiven = parseFloat(document.getElementById('cash-given-input').value) || 0;
        const vuelto = cashGiven >= total ? cashGiven - total : 0;
        
        if (cashGiven < total && !finalOrderData.currentMesa) {
            checkoutBtn.disabled = false;
            checkoutBtn.textContent = '✅ Enviar Pedido a WhatsApp';
            return alert("El monto en efectivo debe cubrir el total.");
        }
        
        paymentDetailMessage = `\n💵 *PAGO:* Efectivo (USD)\n➡️ *Pagas con:* ${cashGiven.toFixed(2)}$\n✅ *Vuelto:* ${vuelto.toFixed(2)}$`;
        paymentDetailLog = `Efectivo. Paga con ${cashGiven.toFixed(2)}$, Vuelto ${vuelto.toFixed(2)}$`;
        
    } else if (paymentMethod === 'pago_movil') {
        const fileInput = document.getElementById('comprobante-file-input');
        const fileName = fileInput.files.length > 0 ? fileInput.files[0].name : "NO ADJUNTADO";
        const totalVES = convertToVES(finalOrderData.total);
        
        paymentDetailMessage = `\n📱 *PAGO:* Pago Móvil (VES)\n🏦 *Total en VES:* ${totalVES.toFixed(2)} VES\n📝 *Comprobante:* ADJUNTADO por cliente (ref: ${fileName})`;
        paymentDetailLog = `Pago Móvil VES. Archivo: ${fileName}`;
    }

    // 2. Construir mensaje de WhatsApp
    const { subtotal, total, fee, distanceKm, lat, lon, serviceText } = finalOrderData;
    
    const isDelivery = serviceText.includes("Delivery");
    
    let message = `🛒 *NUEVO PEDIDO PA QUE WAINER* [${serviceText.split(' ')[0]}] \n\n`;
    
    // AGRUPACIÓN DE ITEMS SIMPLES (mismo código que antes)
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
    
    // Incluir detalles de servicio y ubicación (similar a sendOrder)
    if (currentMesa) {
        message += `📍 *ORDEN DE MESA N°: ${currentMesa}*\n`;
        message += `✅ *SERVICIO:* COMER EN LOCAL 🍽️\n`;
    } else if (isDelivery) {
        if (distanceKm > 0 && lat && lon) {
            message += `✅ *SERVICIO:* DELIVERY 🚚\n`;
            message += `📍 *DISTANCIA CALCULADA:* ${distanceKm.toFixed(2)} km\n`;
            message += `💵 *COSTO DELIVERY:* ${fee.toFixed(2)}$\n`;
            message += `🗺️ *UBICACIÓN CLIENTE:* http://maps.google.com/?q=${lat},${lon}\n`;
        } else {
            message += `❌ *SERVICIO:* DELIVERY (SIN UBICACIÓN) 🚚\n`;
        }
        message += `\n*SUBTOTAL (Comida):* ${subtotal.toFixed(2)}$\n`;
    } else {
        message += `✅ *SERVICIO:* RETIRO EN TIENDA 🚶\n`;
    }
    
    // Incluir detalles de pago
    message += `\n💰 *TOTAL FINAL (USD):* ${total.toFixed(2)}$\n`;
    message += paymentDetailMessage;
    
    message += "\n----------------------------------\n";
    message += `Tasa VES/USD utilizada: ${MENU_DATA.info.exchange_rate.toFixed(2)}\n`;
    message += "\nPor favor, indique su nombre.";
    
    // 3. Abrir WhatsApp y registrar en Excel
    const mapsUrlForLog = (lat && lon) ? `http://maps.google.com/?q=${lat},${lon}` : "N/A";
    
    const logData = {
        fecha: new Date().toLocaleDateString('es-VE'),
        hora: new Date().toLocaleTimeString('es-VE'),
        total: total.toFixed(2),
        servicio: serviceText.split(' ')[0], // Solo Delivery o Retiro, etc.
        distancia: distanceKm > 0 ? `${distanceKm.toFixed(2)} km` : "N/A",
        detalle_pedido: Object.values(consolidatedCart).map(item => `${item.quantity}x ${item.name}`).join('; '),
        ubicacion_url: mapsUrlForLog,
        // Nuevo campo
        metodo_pago: paymentDetailLog
    };

    logOrderToSheet(logData);
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${MENU_DATA.info.whatsapp_number}?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
    
    // Limpiar después de enviar
    localStorage.setItem('lastOrderTime', Date.now());
    cart = {};
    closePaymentModal();
    updateCartDisplay();
}

function logOrderToSheet(logData) {
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
}
